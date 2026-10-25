import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { SchemaValidator } from '../../core/validation/schema-validator';
import { requireCompanyId } from '../../core/http/http-router';
import type { CallbackOutcome, GoogleCalendarIntegrationService } from './integracao.service';

const callbackQuerySchema = z.object({
    code:  z.string().optional(),
    state: z.string().optional(),
    error: z.string().optional(),
}).catch({});

/** Adapta HTTP ⇄ GoogleCalendarIntegrationService. */
export class IntegracaoController {
    constructor(
        private readonly service: GoogleCalendarIntegrationService,
        private readonly frontendUrl: string,
    ) {}

    getAuthUrl = async (req: FastifyRequest, reply: FastifyReply) => {
        return reply.send({ url: this.service.authUrl(requireCompanyId(req)) });
    };

    /** Público: o Google redireciona o navegador para cá depois do consentimento. */
    callback = async (req: FastifyRequest, reply: FastifyReply) => {
        const outcome = await this.service.handleCallback(SchemaValidator.parse(callbackQuerySchema, req.query));
        return reply.redirect(this.frontendRedirect(outcome));
    };

    getStatus = async (req: FastifyRequest, reply: FastifyReply) => {
        return reply.send(await this.service.getStatus(requireCompanyId(req)));
    };

    disconnect = async (req: FastifyRequest, reply: FastifyReply) => {
        await this.service.disconnect(requireCompanyId(req));
        return reply.status(204).send();
    };

    private frontendRedirect(outcome: CallbackOutcome): string {
        const query = outcome === 'connected' ? 'connected=true' : `error=${outcome}`;
        return `${this.frontendUrl}/dashboard/configuracoes/integracoes?${query}`;
    }
}
