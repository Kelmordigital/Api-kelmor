"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleCalendarIntegrationService = void 0;
const google_gateways_1 = require("./google.gateways");
/** Renova o access token um pouco antes de expirar, para não falhar no meio da chamada. */
const REFRESH_MARGIN_MS = 60_000;
class GoogleCalendarIntegrationService {
    repository;
    oauth;
    stateSigner;
    now;
    constructor(repository, oauth, stateSigner, now = () => new Date()) {
        this.repository = repository;
        this.oauth = oauth;
        this.stateSigner = stateSigner;
        this.now = now;
    }
    authUrl(companyId) {
        return this.oauth.authUrl(this.stateSigner.sign(companyId));
    }
    async handleCallback({ code, state, error }) {
        if (error)
            return error === 'access_denied' ? 'access_denied' : 'oauth_failed';
        if (!code || !state)
            return 'missing_params';
        const companyId = this.stateSigner.verify(state);
        if (!companyId)
            return 'invalid_state';
        try {
            await this.connect(companyId, code);
            return 'connected';
        }
        catch (err) {
            console.error('[integracoes/callback] Erro:', err);
            return 'oauth_failed';
        }
    }
    async getStatus(companyId) {
        const row = await this.repository.findByCompany(companyId);
        if (!row)
            return { connected: false, needs_reconnect: false };
        return { connected: true, email: row.google_email ?? undefined, needs_reconnect: !!row.reconnect_required_at };
    }
    disconnect(companyId) {
        return this.repository.deleteByCompany(companyId);
    }
    async validCredentials(companyId) {
        const row = await this.repository.findByCompany(companyId);
        // Marcada para reconectar: não insiste com tokens que o Google já recusou
        if (!row || row.reconnect_required_at)
            return null;
        const expiresSoon = row.token_expiry && row.token_expiry.getTime() - REFRESH_MARGIN_MS < this.now().getTime();
        if (!expiresSoon)
            return { access_token: row.access_token, refresh_token: row.refresh_token };
        try {
            const refreshed = await this.oauth.refreshAccessToken(row.refresh_token);
            const updated = await this.repository.updateAccessToken(row.id, refreshed.access_token, refreshed.token_expiry);
            return { access_token: updated.access_token, refresh_token: updated.refresh_token };
        }
        catch (err) {
            if (!(err instanceof google_gateways_1.GoogleAccessRevokedError))
                throw err;
            await this.reportAccessRevoked(companyId);
            return null;
        }
    }
    async reportAccessRevoked(companyId) {
        console.warn(`[integracoes] Google recusou os tokens da empresa ${companyId}: admin precisa reconectar`);
        await this.repository.markReconnectRequired(companyId, this.now());
    }
    async connect(companyId, code) {
        const tokens = await this.oauth.exchangeCode(code);
        // Numa reconexão o Google pode não mandar refresh_token: mantém o atual
        const refreshToken = tokens.refresh_token ?? (await this.repository.findByCompany(companyId))?.refresh_token;
        if (!refreshToken)
            throw new Error('Google não devolveu refresh_token');
        await this.repository.saveConnection(companyId, {
            access_token: tokens.access_token,
            refresh_token: refreshToken,
            token_expiry: tokens.token_expiry,
            google_email: tokens.google_email,
        });
    }
}
exports.GoogleCalendarIntegrationService = GoogleCalendarIntegrationService;
//# sourceMappingURL=integracao.service.js.map