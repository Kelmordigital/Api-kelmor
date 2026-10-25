import { describe, it, expect, vi } from 'vitest';
import { AccountStatusPolicy } from '../../src/modules/auth/account-status-policy';
import { AuthenticationService } from '../../src/modules/auth/auth.service';
import { TwoFactorService, type EphemeralStore } from '../../src/modules/auth/two-factor.service';
import type { AuthRepository, UserWithProfile } from '../../src/modules/auth/auth.repository';
import { ForbiddenError, ServiceUnavailableError, UnauthorizedError, BadRequestError } from '../../src/core/errors/http-errors';

const active = async () => true;

describe('AccountStatusPolicy', () => {
    const ok = { email_verified: true, is_approved: true, profile_tag: 'user', company_id: 'c1' };

    it.each([
        [{ ...ok, email_verified: false, is_approved: false }, 'email_not_verified'],
        [{ ...ok, is_approved: false },                        'not_approved'],
        [{ ...ok, company_id: null },                          'no_company'],
    ])('%j → %s', async (account, block) => {
        expect(await AccountStatusPolicy.blockOf(account, active)).toBe(block);
    });

    it('empresa inativa bloqueia; superAdmin não precisa de empresa', async () => {
        expect(await AccountStatusPolicy.blockOf(ok, async () => false)).toBe('company_inactive');
        expect(await AccountStatusPolicy.blockOf({ ...ok, profile_tag: 'superAdmin', company_id: null }, async () => false)).toBeNull();
        expect(await AccountStatusPolicy.blockOf(ok, active)).toBeNull();
    });
});

const user = (over: Partial<UserWithProfile> = {}): UserWithProfile => ({
    id: 'u1', name: 'Ana', email: 'ana@x.com', password_hash: 'hash:senha', profile_id: 1, profile_tag: 'user',
    company_id: 'c1', email_verified: true, is_approved: true, finance: false, totp_enabled: false,
    avatar_url: null, hide_name_active: false, ...over,
});

function make(found: UserWithProfile | null) {
    const repo = {
        findByEmailWithProfile: vi.fn(async () => found),
        findByIdWithProfile: vi.fn(async () => found),
        isCompanyActive: vi.fn(async () => true),
        saveRefreshToken: vi.fn(async () => {}),
        deleteRefreshToken: vi.fn(async () => {}),
    } as unknown as AuthRepository;
    const hasher = { hash: vi.fn(async (p: string) => `hash:${p}`), verify: vi.fn(async (p: string, h: string) => h === `hash:${p}`) };
    const tokens = {
        access: vi.fn(() => 'access'), refresh: vi.fn(() => 'refresh'), verifyRefresh: vi.fn(() => ({ sub: 'u1' })),
        totpTicket: vi.fn(() => 'ticket'), verifyTotpTicket: vi.fn(() => null),
    };
    const sessions = { open: vi.fn(async () => {}), revoke: vi.fn(async () => {}) };
    const service = new AuthenticationService(repo, hasher, tokens, sessions, {} as TwoFactorService, {} as EphemeralStore);
    return { repo, hasher, tokens, sessions, service };
}

describe('AuthenticationService', () => {
    it('usuário inexistente e senha errada dão a mesma resposta (e ambos conferem um hash)', async () => {
        const missing = make(null);
        await expect(missing.service.login('x@x.com', 'senha')).rejects.toEqual(new UnauthorizedError('Usuário ou senha inválido'));
        expect(missing.hasher.verify).toHaveBeenCalled();

        const wrong = make(user());
        await expect(wrong.service.login('ana@x.com', 'errada')).rejects.toEqual(new UnauthorizedError('Usuário ou senha inválido'));
    });

    it('conta bloqueada → 403 com o motivo; nenhuma sessão aberta', async () => {
        const { service, sessions } = make(user({ is_approved: false }));
        await expect(service.login('ana@x.com', 'senha')).rejects.toEqual(new ForbiddenError('Sua conta está aguardando aprovação.'));
        expect(sessions.open).not.toHaveBeenCalled();
    });

    it('com 2FA: devolve só o ticket, sem sessão', async () => {
        const { service, sessions } = make(user({ totp_enabled: true }));
        expect(await service.login('ana@x.com', 'senha')).toEqual({ kind: 'totp_required', ticket: 'ticket' });
        expect(sessions.open).not.toHaveBeenCalled();
    });

    it('login liberado: abre a sessão de 7 dias e guarda o refresh token', async () => {
        const { service, sessions, repo } = make(user());
        const result = await service.login('ana@x.com', 'senha');
        expect(result.kind).toBe('session');
        expect(sessions.open).toHaveBeenCalledWith('user', 'c1', 'u1', 7 * 24 * 60 * 60);
        expect(repo.saveRefreshToken).toHaveBeenCalledWith('u1', 'refresh', expect.any(Date));
    });

    it('logout apaga o refresh token e derruba a sessão do dono', async () => {
        const { service, sessions, repo } = make(user());
        await service.logout('refresh');
        expect(repo.deleteRefreshToken).toHaveBeenCalledWith('refresh');
        expect(sessions.revoke).toHaveBeenCalledWith('c1', 'u1');
    });
});

describe('TwoFactorService', () => {
    const store = (available: boolean, secret: string | null = null): EphemeralStore => ({
        isAvailable: () => available, get: vi.fn(async () => secret), set: vi.fn(async () => {}),
        setIfAbsent: vi.fn(async () => true), delete: vi.fn(async () => {}),
    });
    const totp = { newSecret: () => 'S', uri: (l: string, s: string) => `otpauth://${l}/${s}`, isValid: (code: string) => code === '123456' };
    const hasher = { hash: vi.fn(async (p: string) => `h:${p}`), verify: vi.fn(async () => false) };
    const repo = { enableTotp: vi.fn(async () => {}) } as unknown as AuthRepository;

    it('sem Redis → 503', async () => {
        await expect(new TwoFactorService(repo, store(false), totp, hasher).setup('u1', 'a@x.com')).rejects.toBeInstanceOf(ServiceUnavailableError);
    });

    it('ativar: exige configuração vigente e código certo; gera 10 códigos de recuperação', async () => {
        await expect(new TwoFactorService(repo, store(true, null), totp, hasher).enable('u1', '123456'))
            .rejects.toEqual(new BadRequestError('Configuração expirada. Gere um novo QR code.'));
        await expect(new TwoFactorService(repo, store(true, 'S'), totp, hasher).enable('u1', '000000'))
            .rejects.toEqual(new BadRequestError('Código inválido'));

        const codes = await new TwoFactorService(repo, store(true, 'S'), totp, hasher).enable('u1', '123456');
        expect(codes).toHaveLength(10);
        expect(codes[0]).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);
        expect(repo.enableTotp).toHaveBeenCalledWith('u1', 'S', expect.arrayContaining([{ hash: `h:${codes[0]}`, used_at: null }]));
    });
});
