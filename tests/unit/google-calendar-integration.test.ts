import { describe, it, expect, vi, afterEach } from 'vitest';
import { GoogleCalendarIntegrationService } from '../../src/modules/integracoes/integracao.service';
import { GoogleCalendarSync } from '../../src/modules/integracoes/calendar-sync';
import type { ConnectionData, IntegrationRepository } from '../../src/modules/integracoes/integracao.repository';
import type { CompanyIntegration } from '../../src/modules/integracoes/integracao.db.schema';
import {
    GoogleAccessRevokedError,
    type CalendarEventsGateway, type GoogleOAuthGateway, type GoogleTokens, type RefreshedAccessToken,
} from '../../src/modules/integracoes/google.gateways';
import type { OAuthStateSigner } from '../../src/modules/integracoes/oauth-state';

/** Fluxo OAuth, renovação de token e sincronização, com o Google simulado. */

const NOW = new Date('2026-10-09T12:00:00Z');

afterEach(() => { vi.restoreAllMocks(); });

class InMemoryIntegrations implements IntegrationRepository {
    rows = new Map<string, CompanyIntegration>();

    async findByCompany(companyId: string) {
        const row = this.rows.get(companyId);
        return row ? { ...row } : null;
    }
    async saveConnection(companyId: string, data: ConnectionData) {
        const existing = this.rows.get(companyId);
        this.rows.set(companyId, {
            id: existing?.id ?? `int-${companyId}`, company_id: companyId, provider: 'google_calendar',
            created_at: NOW, updated_at: NOW, ...data, reconnect_required_at: null,
        });
    }
    async markReconnectRequired(companyId: string, at: Date) {
        const row = this.rows.get(companyId);
        if (row) row.reconnect_required_at = at;
    }
    async updateAccessToken(id: string, accessToken: string, tokenExpiry: Date | null) {
        const row = [...this.rows.values()].find((r) => r.id === id)!;
        Object.assign(row, { access_token: accessToken, token_expiry: tokenExpiry });
        return { ...row };
    }
    async deleteByCompany(companyId: string) { this.rows.delete(companyId); }
}

class FakeOAuth implements GoogleOAuthGateway {
    tokens: GoogleTokens = { access_token: 'at-1', refresh_token: 'rt-1', token_expiry: new Date(NOW.getTime() + 3600_000), google_email: 'a@b.com' };
    refreshed: RefreshedAccessToken = { access_token: 'at-new', token_expiry: new Date(NOW.getTime() + 3600_000) };
    exchange = vi.fn(async (_code: string) => this.tokens);
    refresh = vi.fn(async (_rt: string) => this.refreshed);

    authUrl(state: string) { return `https://google/auth?state=${state}`; }
    exchangeCode(code: string) { return this.exchange(code); }
    refreshAccessToken(rt: string) { return this.refresh(rt); }
}

const signer: OAuthStateSigner = {
    sign: (companyId) => `signed:${companyId}`,
    verify: (state) => (state.startsWith('signed:') ? state.slice(7) : null),
};

function make() {
    const repo = new InMemoryIntegrations();
    const oauth = new FakeOAuth();
    const service = new GoogleCalendarIntegrationService(repo, oauth, signer, () => NOW);
    return { repo, oauth, service };
}

describe('GoogleCalendarIntegrationService — callback', () => {
    it('code + state válido → conecta e guarda tokens e e-mail', async () => {
        const { service, repo } = make();
        expect(await service.handleCallback({ code: 'c', state: 'signed:co1' })).toBe('connected');
        expect(repo.rows.get('co1')).toMatchObject({ access_token: 'at-1', refresh_token: 'rt-1', google_email: 'a@b.com' });
    });

    it('reconectar substitui os tokens na mesma linha', async () => {
        const { service, repo, oauth } = make();
        await service.handleCallback({ code: 'c', state: 'signed:co1' });
        oauth.tokens = { ...oauth.tokens, access_token: 'at-2', refresh_token: 'rt-2', google_email: 'outra@b.com' };
        await service.handleCallback({ code: 'c', state: 'signed:co1' });
        expect(repo.rows.size).toBe(1);
        expect(repo.rows.get('co1')).toMatchObject({ id: 'int-co1', access_token: 'at-2', refresh_token: 'rt-2', google_email: 'outra@b.com' });
    });

    it('reconexão sem refresh_token mantém o refresh_token atual', async () => {
        const { service, repo, oauth } = make();
        await service.handleCallback({ code: 'c', state: 'signed:co1' });
        oauth.tokens = { ...oauth.tokens, access_token: 'at-2', refresh_token: null };
        expect(await service.handleCallback({ code: 'c', state: 'signed:co1' })).toBe('connected');
        expect(repo.rows.get('co1')).toMatchObject({ access_token: 'at-2', refresh_token: 'rt-1' });
    });

    it('primeira conexão sem refresh_token → oauth_failed (sem ele a integração para em 1h)', async () => {
        const { service, repo, oauth } = make();
        oauth.tokens = { ...oauth.tokens, refresh_token: null };
        vi.spyOn(console, 'error').mockImplementationOnce(() => {});
        expect(await service.handleCallback({ code: 'c', state: 'signed:co1' })).toBe('oauth_failed');
        expect(repo.rows.size).toBe(0);
    });

    it('falha na troca do code → oauth_failed', async () => {
        const { service, oauth } = make();
        oauth.exchange.mockRejectedValueOnce(new Error('invalid_grant'));
        vi.spyOn(console, 'error').mockImplementationOnce(() => {});
        expect(await service.handleCallback({ code: 'c', state: 'signed:co1' })).toBe('oauth_failed');
    });

    it.each([
        [{ code: 'c' },                              'missing_params'],
        [{ state: 'signed:co1' },                    'missing_params'],
        [{ code: 'c', state: 'co1' },                'invalid_state'],
        [{ error: 'access_denied', state: 'x' },     'access_denied'],
        [{ error: 'server_error' },                  'oauth_failed'],
    ])('%j → %s, sem chamar o Google', async (params, outcome) => {
        const { service, oauth } = make();
        expect(await service.handleCallback(params)).toBe(outcome);
        expect(oauth.exchange).not.toHaveBeenCalled();
    });
});

describe('GoogleCalendarIntegrationService — credenciais', () => {
    async function connectedWithExpiry(expiry: Date | null) {
        const ctx = make();
        ctx.oauth.tokens = { ...ctx.oauth.tokens, token_expiry: expiry };
        await ctx.service.handleCallback({ code: 'c', state: 'signed:co1' });
        return ctx;
    }

    it('sem integração → null', async () => {
        expect(await make().service.validCredentials('co1')).toBeNull();
    });

    it('token válido por mais de 1 minuto → usa o atual', async () => {
        const { service, oauth } = await connectedWithExpiry(new Date(NOW.getTime() + 5 * 60_000));
        expect(await service.validCredentials('co1')).toEqual({ access_token: 'at-1', refresh_token: 'rt-1' });
        expect(oauth.refresh).not.toHaveBeenCalled();
    });

    it('token expira em menos de 1 minuto → renova e grava', async () => {
        const { service, oauth, repo } = await connectedWithExpiry(new Date(NOW.getTime() + 30_000));
        expect(await service.validCredentials('co1')).toEqual({ access_token: 'at-new', refresh_token: 'rt-1' });
        expect(oauth.refresh).toHaveBeenCalledWith('rt-1');
        expect(repo.rows.get('co1')!.access_token).toBe('at-new');
    });

    it('Google recusa a renovação → marca para reconectar, devolve null e para de insistir', async () => {
        const { service, oauth, repo } = await connectedWithExpiry(new Date(NOW.getTime() - 1000));
        oauth.refresh.mockRejectedValueOnce(new GoogleAccessRevokedError(new Error('invalid_grant')));
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        expect(await service.validCredentials('co1')).toBeNull();
        expect(repo.rows.get('co1')!.reconnect_required_at).toEqual(NOW);
        expect(await service.getStatus('co1')).toEqual({ connected: true, email: 'a@b.com', needs_reconnect: true });

        expect(await service.validCredentials('co1')).toBeNull();
        expect(oauth.refresh).toHaveBeenCalledTimes(1);
    });

    it('reconectar limpa o aviso', async () => {
        const { service, repo } = await connectedWithExpiry(null);
        await repo.markReconnectRequired('co1', NOW);
        await service.handleCallback({ code: 'c', state: 'signed:co1' });
        expect(await service.getStatus('co1')).toMatchObject({ connected: true, needs_reconnect: false });
        expect(await service.validCredentials('co1')).not.toBeNull();
    });

    it('outras falhas na renovação (rede, Google fora) não marcam e propagam', async () => {
        const { service, oauth, repo } = await connectedWithExpiry(new Date(NOW.getTime() - 1000));
        oauth.refresh.mockRejectedValueOnce(new Error('ECONNRESET'));
        await expect(service.validCredentials('co1')).rejects.toThrow('ECONNRESET');
        expect(repo.rows.get('co1')!.reconnect_required_at).toBeNull();
    });

    it('sem data de expiração → usa o atual', async () => {
        const { service, oauth } = await connectedWithExpiry(null);
        expect((await service.validCredentials('co1'))!.access_token).toBe('at-1');
        expect(oauth.refresh).not.toHaveBeenCalled();
    });
});

describe('GoogleCalendarSync', () => {
    const event = { title: 'Visita', start_at: NOW, end_at: NOW };
    const creds = { access_token: 'at', refresh_token: 'rt' };

    function makeSync(validCredentials: (id: string) => Promise<typeof creds | null>) {
        const events = {
            insert: vi.fn<CalendarEventsGateway['insert']>(async () => 'evt-1'),
            update: vi.fn<CalendarEventsGateway['update']>(async () => {}),
            delete: vi.fn<CalendarEventsGateway['delete']>(async () => {}),
        };
        const provider = { validCredentials, reportAccessRevoked: vi.fn(async (_id: string) => {}) };
        return { events, provider, sync: new GoogleCalendarSync(provider, events) };
    }

    it('com integração: cria, atualiza e apaga no Google', async () => {
        const { sync, events } = makeSync(async () => creds);
        expect(await sync.createEvent('co1', event)).toBe('evt-1');
        await sync.updateEvent('co1', 'evt-1', event);
        await sync.deleteEvent('co1', 'evt-1');
        expect(events.update).toHaveBeenCalledWith(creds, 'evt-1', event);
        expect(events.delete).toHaveBeenCalledWith(creds, 'evt-1');
    });

    it('sem integração: não chama o Google e devolve null', async () => {
        const { sync, events } = makeSync(async () => null);
        expect(await sync.createEvent('co1', event)).toBeNull();
        expect(events.insert).not.toHaveBeenCalled();
    });

    it('falha inesperada ao obter credenciais não lança — antes virava 500 na agenda', async () => {
        const { sync } = makeSync(async () => { throw new Error('ECONNRESET'); });
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        await expect(sync.createEvent('co1', event)).resolves.toBeNull();
        await expect(sync.updateEvent('co1', 'e', event)).resolves.toBeUndefined();
        await expect(sync.deleteEvent('co1', 'e')).resolves.toBeUndefined();
        expect(log).toHaveBeenCalledTimes(3);
    });

    it('Google recusa o acesso numa chamada → avisa para reconectar e não lança', async () => {
        const { sync, events, provider } = makeSync(async () => creds);
        events.insert.mockRejectedValueOnce(new GoogleAccessRevokedError(new Error('401')));
        expect(await sync.createEvent('co1', event)).toBeNull();
        expect(provider.reportAccessRevoked).toHaveBeenCalledWith('co1');
    });

    it('outras falhas do Google só vão para o log', async () => {
        const { sync, events, provider } = makeSync(async () => creds);
        events.update.mockRejectedValueOnce(new Error('500 backendError'));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        await sync.updateEvent('co1', 'e', event);
        expect(provider.reportAccessRevoked).not.toHaveBeenCalled();
    });
});

describe('GoogleAccessRevokedError.matches', () => {
    it.each([
        [{ response: { status: 401 } },                                  true],
        [{ response: { status: 400, data: { error: 'invalid_grant' } } }, true],
        [{ message: 'invalid_grant' },                                   true],
        [{ message: 'Request had insufficient authentication scopes.' }, true],
        [{ response: { status: 500 }, message: 'backendError' },         false],
        [{ message: 'ECONNRESET' },                                      false],
        [null,                                                           false],
    ])('%j → %s', (err, expected) => {
        expect(GoogleAccessRevokedError.matches(err)).toBe(expected);
    });
});
