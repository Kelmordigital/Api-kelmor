import type { IntegrationRepository } from './integracao.repository';
import { GoogleAccessRevokedError, type GoogleCredentials, type GoogleOAuthGateway } from './google.gateways';
import type { OAuthStateSigner } from './oauth-state';

/** Resultado do callback; vira `?connected=true` ou `?error=<motivo>` no front. */
export type CallbackOutcome = 'connected' | 'missing_params' | 'invalid_state' | 'access_denied' | 'oauth_failed';

export interface CallbackParams {
    code?: string;
    state?: string;
    /** Preenchido pelo Google quando o usuário cancela ou algo dá errado lá. */
    error?: string;
}

export interface IntegrationStatus {
    connected: boolean;
    email?: string;
    /** O Google recusou os tokens: o admin precisa reconectar a conta. */
    needs_reconnect: boolean;
}

/** Quem precisa falar com o Google em nome da empresa só depende disto (ISP). */
export interface GoogleCredentialsProvider {
    /** null se a empresa não está conectada ou precisa reconectar. */
    validCredentials(companyId: string): Promise<GoogleCredentials | null>;
    /** O Google recusou os tokens: marca a integração para o admin reconectar. */
    reportAccessRevoked(companyId: string): Promise<void>;
}

/** Renova o access token um pouco antes de expirar, para não falhar no meio da chamada. */
const REFRESH_MARGIN_MS = 60_000;

export class GoogleCalendarIntegrationService implements GoogleCredentialsProvider {
    constructor(
        private readonly repository: IntegrationRepository,
        private readonly oauth: GoogleOAuthGateway,
        private readonly stateSigner: OAuthStateSigner,
        private readonly now: () => Date = () => new Date(),
    ) {}

    authUrl(companyId: string): string {
        return this.oauth.authUrl(this.stateSigner.sign(companyId));
    }

    async handleCallback({ code, state, error }: CallbackParams): Promise<CallbackOutcome> {
        if (error) return error === 'access_denied' ? 'access_denied' : 'oauth_failed';
        if (!code || !state) return 'missing_params';

        const companyId = this.stateSigner.verify(state);
        if (!companyId) return 'invalid_state';

        try {
            await this.connect(companyId, code);
            return 'connected';
        } catch (err) {
            console.error('[integracoes/callback] Erro:', err);
            return 'oauth_failed';
        }
    }

    async getStatus(companyId: string): Promise<IntegrationStatus> {
        const row = await this.repository.findByCompany(companyId);
        if (!row) return { connected: false, needs_reconnect: false };
        return { connected: true, email: row.google_email ?? undefined, needs_reconnect: !!row.reconnect_required_at };
    }

    disconnect(companyId: string): Promise<void> {
        return this.repository.deleteByCompany(companyId);
    }

    async validCredentials(companyId: string): Promise<GoogleCredentials | null> {
        const row = await this.repository.findByCompany(companyId);
        // Marcada para reconectar: não insiste com tokens que o Google já recusou
        if (!row || row.reconnect_required_at) return null;

        const expiresSoon = row.token_expiry && row.token_expiry.getTime() - REFRESH_MARGIN_MS < this.now().getTime();
        if (!expiresSoon) return { access_token: row.access_token, refresh_token: row.refresh_token };

        try {
            const refreshed = await this.oauth.refreshAccessToken(row.refresh_token);
            const updated = await this.repository.updateAccessToken(row.id, refreshed.access_token, refreshed.token_expiry);
            return { access_token: updated.access_token, refresh_token: updated.refresh_token };
        } catch (err) {
            if (!(err instanceof GoogleAccessRevokedError)) throw err;
            await this.reportAccessRevoked(companyId);
            return null;
        }
    }

    async reportAccessRevoked(companyId: string): Promise<void> {
        console.warn(`[integracoes] Google recusou os tokens da empresa ${companyId}: admin precisa reconectar`);
        await this.repository.markReconnectRequired(companyId, this.now());
    }

    private async connect(companyId: string, code: string): Promise<void> {
        const tokens = await this.oauth.exchangeCode(code);
        // Numa reconexão o Google pode não mandar refresh_token: mantém o atual
        const refreshToken = tokens.refresh_token ?? (await this.repository.findByCompany(companyId))?.refresh_token;
        if (!refreshToken) throw new Error('Google não devolveu refresh_token');

        await this.repository.saveConnection(companyId, {
            access_token:  tokens.access_token,
            refresh_token: refreshToken,
            token_expiry:  tokens.token_expiry,
            google_email:  tokens.google_email,
        });
    }
}
