import { FastifyRequest, FastifyReply } from 'fastify';
import { automaticTagRuleService } from './automatic-tag-rule.service';

export const automaticTagRuleController = {

    async list(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const list = await automaticTagRuleService.list(companyId);
        return reply.send(list);
    },

    async create(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const { keywords, etiqueta_ids } = req.body as { keywords: string; etiqueta_ids?: string[] };
        if (!keywords?.trim()) return reply.status(400).send({ error: 'keywords é obrigatório' });

        try {
            const row = await automaticTagRuleService.create(companyId, keywords.trim(), etiqueta_ids ?? []);
            return reply.status(201).send(row);
        } catch (err) {
            return reply.status(400).send({ error: err instanceof Error ? err.message : 'Erro ao criar regra' });
        }
    },

    async update(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const { id } = req.params as { id: string };
        const { keywords, etiqueta_ids } = req.body as { keywords: string; etiqueta_ids?: string[] };
        if (!keywords?.trim()) return reply.status(400).send({ error: 'keywords é obrigatório' });

        const row = await automaticTagRuleService.update(Number(id), companyId, keywords.trim(), etiqueta_ids ?? []);
        if (!row) return reply.status(404).send({ error: 'Regra não encontrada' });
        return reply.send(row);
    },

    async remove(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const { id } = req.params as { id: string };
        const ok = await automaticTagRuleService.remove(Number(id), companyId);
        if (!ok) return reply.status(404).send({ error: 'Regra não encontrada' });
        return reply.status(204).send();
    },
};
