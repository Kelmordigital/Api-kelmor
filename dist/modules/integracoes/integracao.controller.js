"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.integracaoController = void 0;
const integracao_service_1 = require("./integracao.service");
const google_calendar_client_1 = require("./google-calendar.client");
const env_1 = require("../../config/env");
exports.integracaoController = {
    async getAuthUrl(req, reply) {
        const companyId = req.user.company_id;
        if (!companyId)
            return reply.status(403).send({ error: 'Empresa não encontrada' });
        const url = (0, google_calendar_client_1.getAuthUrlWithState)(companyId);
        return reply.send({ url });
    },
    async callback(req, reply) {
        const { code, state } = req.query;
        if (!code || !state) {
            return reply.redirect(`${env_1.env.FRONTEND_URL}/dashboard/configuracoes/integracoes?error=missing_params`);
        }
        try {
            await integracao_service_1.integracaoService.handleCallback(state, code);
            return reply.redirect(`${env_1.env.FRONTEND_URL}/dashboard/configuracoes/integracoes?connected=true`);
        }
        catch (err) {
            console.error('[integracoes/callback] Erro:', err);
            return reply.redirect(`${env_1.env.FRONTEND_URL}/dashboard/configuracoes/integracoes?error=oauth_failed`);
        }
    },
    async getStatus(req, reply) {
        const companyId = req.user.company_id;
        if (!companyId)
            return reply.status(403).send({ error: 'Empresa não encontrada' });
        const status = await integracao_service_1.integracaoService.getStatus(companyId);
        return reply.send(status);
    },
    async disconnect(req, reply) {
        const companyId = req.user.company_id;
        if (!companyId)
            return reply.status(403).send({ error: 'Empresa não encontrada' });
        await integracao_service_1.integracaoService.disconnect(companyId);
        return reply.status(204).send();
    },
};
//# sourceMappingURL=integracao.controller.js.map