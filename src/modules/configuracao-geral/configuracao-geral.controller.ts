import { FastifyRequest, FastifyReply } from 'fastify';
import { configuracaoGeralService, ConfiguracaoGeralPayload } from './configuracao-geral.service';

export const configuracaoGeralController = {

    async get(req: FastifyRequest, reply: FastifyReply) {
        const data = await configuracaoGeralService.get(req.user.company_id!);
        return reply.send(data);
    },

    async update(req: FastifyRequest, reply: FastifyReply) {
        const body = req.body as ConfiguracaoGeralPayload;
        const data = await configuracaoGeralService.update(req.user.company_id!, body);
        return reply.send(data);
    },
};
