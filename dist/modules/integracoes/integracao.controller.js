"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegracaoController = void 0;
const zod_1 = require("zod");
const schema_validator_1 = require("../../core/validation/schema-validator");
const http_router_1 = require("../../core/http/http-router");
const callbackQuerySchema = zod_1.z.object({
    code: zod_1.z.string().optional(),
    state: zod_1.z.string().optional(),
    error: zod_1.z.string().optional(),
}).catch({});
/** Adapta HTTP ⇄ GoogleCalendarIntegrationService. */
class IntegracaoController {
    service;
    frontendUrl;
    constructor(service, frontendUrl) {
        this.service = service;
        this.frontendUrl = frontendUrl;
    }
    getAuthUrl = async (req, reply) => {
        return reply.send({ url: this.service.authUrl((0, http_router_1.requireCompanyId)(req)) });
    };
    /** Público: o Google redireciona o navegador para cá depois do consentimento. */
    callback = async (req, reply) => {
        const outcome = await this.service.handleCallback(schema_validator_1.SchemaValidator.parse(callbackQuerySchema, req.query));
        return reply.redirect(this.frontendRedirect(outcome));
    };
    getStatus = async (req, reply) => {
        return reply.send(await this.service.getStatus((0, http_router_1.requireCompanyId)(req)));
    };
    disconnect = async (req, reply) => {
        await this.service.disconnect((0, http_router_1.requireCompanyId)(req));
        return reply.status(204).send();
    };
    frontendRedirect(outcome) {
        const query = outcome === 'connected' ? 'connected=true' : `error=${outcome}`;
        return `${this.frontendUrl}/dashboard/configuracoes/integracoes?${query}`;
    }
}
exports.IntegracaoController = IntegracaoController;
//# sourceMappingURL=integracao.controller.js.map