import { z } from 'zod';

/** Data/hora ISO; string que não vira data válida é recusada com `<campo> inválido`. */
const dateTime = (field: string) =>
    z.string({ error: `${field} inválido` })
        .transform((s) => new Date(s))
        .refine((d) => !Number.isNaN(d.getTime()), `${field} inválido`);

const title = z.string({ error: 'title é obrigatório' }).trim().min(1, 'title é obrigatório');

/** Campos opcionais comuns a criação e edição. */
const details = {
    lead_id:          z.string({ error: 'lead_id inválido' }).max(100, 'lead_id inválido').nullish(),
    color:            z.string({ error: 'color inválida' }).max(20, 'color inválida').optional(),
    notes:            z.string({ error: 'notes inválido' }).nullish(),
    notify_on_create: z.boolean({ error: 'notify_on_create inválido' }).optional(),
    reminder_minutes: z.number({ error: 'reminder_minutes inválido' }).int('reminder_minutes inválido').min(0, 'reminder_minutes inválido').nullish(),
    remind_at_exact:  z.boolean({ error: 'remind_at_exact inválido' }).optional(),
    notify_groups:    z.array(z.number({ error: 'notify_groups inválido' }).int('notify_groups inválido'), { error: 'notify_groups inválido' }).optional(),
};

export const agendamentoIdParamsSchema = z.object({
    id: z.guid('id inválido'),
});

export const agendaListQuerySchema = z.object({
    start: dateTime('start').optional(),
    end:   dateTime('end').optional(),
});

/** Presença de start_at/end_at e a ordem entre eles são regra do AgendaService. */
export const createAgendamentoSchema = z.object({
    title,
    start_at: dateTime('start_at').optional(),
    end_at:   dateTime('end_at').optional(),
    ...details,
}, { error: 'Corpo da requisição inválido' });

export const updateAgendamentoSchema = z.object({
    title:    title.optional(),
    start_at: dateTime('start_at').optional(),
    end_at:   dateTime('end_at').optional(),
    ...details,
}, { error: 'Corpo da requisição inválido' });

export type AgendaListQuery          = z.infer<typeof agendaListQuerySchema>;
export type CreateAgendamentoInput   = z.infer<typeof createAgendamentoSchema>;
export type UpdateAgendamentoInput   = z.infer<typeof updateAgendamentoSchema>;
