import type { IntegrationRepository } from './integracao.repository';
import { type GoogleCredentials, type GoogleOAuthGateway } from './google.gateways';
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
export declare class GoogleCalendarIntegrationService implements GoogleCredentialsProvider {
    private readonly repository;
    private readonly oauth;
    private readonly stateSigner;
    private readonly now;
    constructor(repository: IntegrationRepository, oauth: GoogleOAuthGateway, stateSigner: OAuthStateSigner, now?: () => Date);
    authUrl(companyId: string): string;
    handleCallback({ code, state, error }: CallbackParams): Promise<CallbackOutcome>;
    getStatus(companyId: string): Promise<IntegrationStatus>;
    disconnect(companyId: string): Promise<void>;
    validCredentials(companyId: string): Promise<GoogleCredentials | null>;
    reportAccessRevoked(companyId: string): Promise<void>;
    private connect;
}
//# sourceMappingURL=integracao.service.d.ts.map