import { FastifyRequest, FastifyReply } from 'fastify';
import { integracaoService } from './integracao.service';
import { getAuthUrlWithState } from './google-calendar.client';
import { env } from '../../config/env';

export const integracaoController = {

    async getAuthUrl(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id;
        if (!companyId) return reply.status(403).send({ error: 'Empresa não encontrada' });

        const url = getAuthUrlWithState(companyId);
        return reply.send({ url });
    },

    async callback(req: FastifyRequest, reply: FastifyReply) {
        const { code, state } = req.query as { code?: string; state?: string };
        if (!code || !state) {
            return reply.redirect(`${env.FRONTEND_URL}/dashboard/configuracoes/integracoes?error=missing_params`);
        }

        try {
            await integracaoService.handleCallback(state, code);
            return reply.redirect(`${env.FRONTEND_URL}/dashboard/configuracoes/integracoes?connected=true`);
        } catch (err) {
            console.error('[integracoes/callback] Erro:', err);
            return reply.redirect(`${env.FRONTEND_URL}/dashboard/configuracoes/integracoes?error=oauth_failed`);
        }
    },

    async getStatus(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id;
        if (!companyId) return reply.status(403).send({ error: 'Empresa não encontrada' });

        const status = await integracaoService.getStatus(companyId);
        return reply.send(status);
    },

    async disconnect(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id;
        if (!companyId) return reply.status(403).send({ error: 'Empresa não encontrada' });

        await integracaoService.disconnect(companyId);
        return reply.status(204).send();
    },
};
