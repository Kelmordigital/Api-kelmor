import { FastifyRequest, FastifyReply } from 'fastify';
import { pesquisaService } from './pesquisa.service';

export const pesquisaController = {

    async list(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const data = await pesquisaService.list(companyId);
        return reply.send(data);
    },

    async listActive(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const data = await pesquisaService.listActive(companyId);
        return reply.send(data);
    },

    async create(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const body = req.body as {
            name?: string;
            type?: string;
            active?: boolean;
            default_research?: boolean;
            answers?: string[];
            queue_ids?: number[];
        };

        if (!body.name?.trim()) {
            return reply.status(400).send({ message: 'O nome da pesquisa é obrigatório' });
        }
        if (!body.answers?.length) {
            return reply.status(400).send({ message: 'Adicione ao menos uma opção de resposta' });
        }

        const research = await pesquisaService.create(companyId, {
            name: body.name.trim(),
            type: body.type,
            active: body.active,
            default_research: body.default_research,
            answers: body.answers,
            queue_ids: body.queue_ids,
        });
        return reply.status(201).send(research);
    },

    async update(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const companyId = req.user.company_id!;
        const body = req.body as {
            name?: string;
            type?: string;
            active?: boolean;
            default_research?: boolean;
            answers?: string[];
            queue_ids?: number[];
        };

        await pesquisaService.update(Number(id), companyId, body);
        return reply.send({ ok: true });
    },

    async remove(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const companyId = req.user.company_id!;
        const removed = await pesquisaService.remove(Number(id), companyId);
        if (!removed) return reply.status(404).send({ message: 'Pesquisa não encontrada' });
        return reply.send({ ok: true });
    },
};
