import { FastifyRequest, FastifyReply } from 'fastify';
import { campanhaService } from './campanha.service';

export const campanhaController = {

    async list(req: FastifyRequest, reply: FastifyReply) {
        const data = await campanhaService.list(req.user.company_id!);
        return reply.send(data);
    },

    async getSelects(req: FastifyRequest, reply: FastifyReply) {
        const data = await campanhaService.getSelects(req.user.company_id!);
        return reply.send(data);
    },

    async create(req: FastifyRequest, reply: FastifyReply) {
        const body = req.body as {
            title?: string;
            message?: string;
            type?: string;
            send_date?: string;
            timezone?: string;
            all_contacts?: boolean;
            connection_ids?: number[];
            contact_ids?: number[];
        };

        if (!body.title?.trim())   return reply.status(400).send({ message: 'O título é obrigatório' });
        if (!body.message?.trim()) return reply.status(400).send({ message: 'A mensagem é obrigatória' });
        if (!body.send_date)       return reply.status(400).send({ message: 'A data de envio é obrigatória' });
        if (!body.connection_ids?.length) return reply.status(400).send({ message: 'Selecione ao menos uma conexão' });

        const campaign = await campanhaService.create(req.user.company_id!, {
            title:          body.title.trim(),
            message:        body.message.trim(),
            type:           body.type,
            send_date:      body.send_date,
            timezone:       body.timezone,
            all_contacts:   body.all_contacts,
            connection_ids: body.connection_ids,
            contact_ids:    body.contact_ids,
        });
        return reply.status(201).send(campaign);
    },

    async update(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const body = req.body as {
            title?: string;
            message?: string;
            send_date?: string;
            timezone?: string;
            all_contacts?: boolean;
            connection_ids?: number[];
            contact_ids?: number[];
        };

        const result = await campanhaService.update(Number(id), req.user.company_id!, body);
        if (!result) return reply.status(404).send({ message: 'Campanha não encontrada' });
        return reply.send({ ok: true });
    },

    async remove(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const removed = await campanhaService.remove(Number(id), req.user.company_id!);
        if (!removed) return reply.status(404).send({ message: 'Campanha não encontrada' });
        return reply.send({ ok: true });
    },

    async play(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const ok = await campanhaService.play(Number(id), req.user.company_id!);
        if (!ok) return reply.status(404).send({ message: 'Campanha não encontrada' });
        return reply.send({ ok: true });
    },

    async pause(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const ok = await campanhaService.pause(Number(id), req.user.company_id!);
        if (!ok) return reply.status(404).send({ message: 'Campanha não encontrada' });
        return reply.send({ ok: true });
    },

    // ── Textos de Agendamento ─────────────────────────────────────────────────

    async listTexts(req: FastifyRequest, reply: FastifyReply) {
        const data = await campanhaService.listTexts(req.user.company_id!);
        return reply.send(data);
    },

    async upsertText(req: FastifyRequest, reply: FastifyReply) {
        const body = req.body as { label?: string; text?: string; type?: number };
        if (!body.label?.trim()) return reply.status(400).send({ message: 'O rótulo é obrigatório' });
        if (!body.type)          return reply.status(400).send({ message: 'O tipo é obrigatório' });

        const result = await campanhaService.upsertText(req.user.company_id!, {
            label: body.label.trim(),
            text: body.text,
            type: Number(body.type),
        });
        return reply.send(result);
    },

    async updateText(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const body = req.body as { label?: string; text?: string };
        if (!body.label?.trim()) return reply.status(400).send({ message: 'O rótulo é obrigatório' });

        const result = await campanhaService.updateText(Number(id), req.user.company_id!, {
            label: body.label.trim(),
            text: body.text,
        });
        if (!result) return reply.status(404).send({ message: 'Texto não encontrado' });
        return reply.send(result);
    },

    async removeText(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const removed = await campanhaService.removeText(Number(id), req.user.company_id!);
        if (!removed) return reply.status(404).send({ message: 'Texto não encontrado' });
        return reply.send({ ok: true });
    },
};
