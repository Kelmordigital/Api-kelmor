import type { FastifyRequest, FastifyReply } from 'fastify';
import type { GoogleCalendarIntegrationService } from './integracao.service';
/** Adapta HTTP ⇄ GoogleCalendarIntegrationService. */
export declare class IntegracaoController {
    private readonly service;
    private readonly frontendUrl;
    constructor(service: GoogleCalendarIntegrationService, frontendUrl: string);
    getAuthUrl: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    /** Público: o Google redireciona o navegador para cá depois do consentimento. */
    callback: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    getStatus: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    disconnect: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    private frontendRedirect;
}
//# sourceMappingURL=integracao.controller.d.ts.map