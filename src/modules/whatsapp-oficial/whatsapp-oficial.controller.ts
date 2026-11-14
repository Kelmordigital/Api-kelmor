import type { FastifyReply, FastifyRequest } from 'fastify';
import { SchemaValidator } from '../../core/validation/schema-validator';
import { requireCompanyId } from '../../core/http/http-router';
import {
    createConnectionSchema, createTemplateSchema, sendTemplateSchema, templateNameParamsSchema, templatesQuerySchema,
} from './whatsapp-oficial.dto';
import type { OfficialConnections, OfficialOnboarding, OfficialTemplates } from './whatsapp-oficial.service';
import type { CloudWebhookService } from './whatsapp-oficial-webhook.service';

/** Rotas autenticadas: conexão, templates e envio de template. */
export class WhatsappOficialController {
    constructor(
        private readonly onboarding: OfficialOnboarding,
        private readonly connections: OfficialConnections,
        private readonly templates: OfficialTemplates,
    ) {}

    /** POST /connections — `{ code }` (Embedded Signup) ou `{ wabaId, phoneNumberId, token, name }`. */
    createConnection = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = requireCompanyId(req);
        const conn = await this.onboarding.connect(companyId, SchemaValidator.parse(createConnectionSchema, req.body ?? {}));
        const { wab_token: _token, ...safe } = conn; // o token da Meta nunca sai da API
        return reply.status(201).send(safe);
    };

    /** GET /templates?connectionId= */
    listTemplates = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = requireCompanyId(req);
        const { connectionId } = SchemaValidator.parse(templatesQuerySchema, req.query);
        return reply.send(await this.templates.list(await this.connections.owned(companyId, connectionId)));
    };

    /** POST /templates */
    createTemplate = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = requireCompanyId(req);
        const { connectionId, ...template } = SchemaValidator.parse(createTemplateSchema, req.body ?? {});
        const conn = await this.connections.owned(companyId, connectionId);
        return reply.status(201).send(await this.templates.create(conn, template));
    };

    /** DELETE /templates/:name?connectionId= */
    deleteTemplate = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = requireCompanyId(req);
        const { name } = SchemaValidator.parse(templateNameParamsSchema, req.params);
        const { connectionId } = SchemaValidator.parse(templatesQuerySchema, req.query);
        await this.templates.remove(await this.connections.owned(companyId, connectionId), name);
        return reply.send({ ok: true });
    };

    /** POST /send-template */
    sendTemplate = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = requireCompanyId(req);
        const { connectionId, to, template, language, components } = SchemaValidator.parse(sendTemplateSchema, req.body ?? {});
        const conn = await this.connections.owned(companyId, connectionId);
        return reply.send({ ok: true, wamid: await this.templates.send(conn, to, template, language, components) });
    };
}

/** Webhook público da Meta (sem usuário logado). */
export class CloudWebhookController {
    constructor(private readonly webhook: CloudWebhookService) {}

    /** GET /wabcloudapi/webhook — handshake ao cadastrar a URL na Meta. */
    verify = async (req: FastifyRequest, reply: FastifyReply) => {
        const q = (req.query ?? {}) as Record<string, unknown>;
        const challenge = this.webhook.verifySubscription(q['hub.mode'], q['hub.verify_token'], q['hub.challenge']);
        if (challenge === null) return reply.status(403).send();
        return reply.status(200).type('text/plain').send(challenge);
    };

    /** POST /wabcloudapi/webhook — responde na hora (a Meta reenvia se demorar) e processa em segundo plano. */
    receive = async (req: FastifyRequest, reply: FastifyReply) => {
        const rawBody = (req as FastifyRequest & { rawBody?: string }).rawBody ?? '';
        const signature = req.headers['x-hub-signature-256'];
        if (!this.webhook.isAuthentic(rawBody, Array.isArray(signature) ? signature[0] : signature)) {
            return reply.status(401).send({ error: 'unauthorized' });
        }
        this.webhook.handle(req.body).catch((err: Error) => console.error('[WAB webhook] Erro não tratado:', err.message));
        return reply.status(200).send({ ok: true });
    };
}
