import { FastifyRequest, FastifyReply } from 'fastify';
import { agendaService } from './agenda.service';

export const agendaController = {

    async list(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id;
        if (!companyId) return reply.status(403).send({ error: 'Empresa não encontrada' });

        const { start, end } = req.query as { start?: string; end?: string };
        const now = new Date();
        const startDate = start ? new Date(start) : new Date(now.getFullYear(), now.getMonth(), 1);
        const endDate   = end   ? new Date(end)   : new Date(now.getFullYear(), now.getMonth() + 1, 0);

        const events = await agendaService.list(companyId, startDate, endDate);
        return reply.send(events);
    },

    async create(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id;
        const userId    = req.user.id;
        if (!companyId) return reply.status(403).send({ error: 'Empresa não encontrada' });

        const {
            title, lead_id, start_at, end_at, color, notes,
            notify_on_create, reminder_minutes, remind_at_exact, notify_groups,
        } = req.body as {
            title: string;
            lead_id?: string;
            start_at: string;
            end_at: string;
            color?: string;
            notes?: string;
            notify_on_create?: boolean;
            reminder_minutes?: number;
            remind_at_exact?: boolean;
            notify_groups?: number[];
        };

        if (!title?.trim()) return reply.status(400).send({ error: 'title é obrigatório' });
        if (!start_at || !end_at) return reply.status(400).send({ error: 'start_at e end_at são obrigatórios' });

        const row = await agendaService.create(companyId, userId, {
            title:            title.trim(),
            lead_id:          lead_id ?? null,
            start_at:         new Date(start_at),
            end_at:           new Date(end_at),
            color:            color ?? '#6366f1',
            notes:            notes ?? null,
            notify_on_create: notify_on_create ?? true,
            reminder_minutes: reminder_minutes ?? null,
            remind_at_exact:  remind_at_exact ?? false,
            notify_groups:    notify_groups ?? [],
        });

        return reply.status(201).send(row);
    },

    async update(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id;
        if (!companyId) return reply.status(403).send({ error: 'Empresa não encontrada' });

        const { id } = req.params as { id: string };
        const body = req.body as {
            title?: string;
            lead_id?: string;
            start_at?: string;
            end_at?: string;
            color?: string;
            notes?: string;
            notify_on_create?: boolean;
            reminder_minutes?: number;
            remind_at_exact?: boolean;
            notify_groups?: number[];
        };

        const payload: Parameters<typeof agendaService.update>[2] = {};
        if (body.title            !== undefined) payload.title            = body.title;
        if (body.lead_id          !== undefined) payload.lead_id          = body.lead_id;
        if (body.start_at         !== undefined) payload.start_at         = new Date(body.start_at);
        if (body.end_at           !== undefined) payload.end_at           = new Date(body.end_at);
        if (body.color            !== undefined) payload.color            = body.color;
        if (body.notes            !== undefined) payload.notes            = body.notes;
        if (body.notify_on_create !== undefined) payload.notify_on_create = body.notify_on_create;
        if (body.reminder_minutes !== undefined) payload.reminder_minutes = body.reminder_minutes;
        if (body.remind_at_exact  !== undefined) payload.remind_at_exact  = body.remind_at_exact;
        if (body.notify_groups    !== undefined) payload.notify_groups    = body.notify_groups;

        const row = await agendaService.update(id, companyId, payload);
        if (!row) return reply.status(404).send({ error: 'Agendamento não encontrado' });
        return reply.send(row);
    },

    async remove(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id;
        if (!companyId) return reply.status(403).send({ error: 'Empresa não encontrada' });

        const { id } = req.params as { id: string };
        const ok = await agendaService.remove(id, companyId);
        if (!ok) return reply.status(404).send({ error: 'Agendamento não encontrado' });
        return reply.status(204).send();
    },
};
