"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateAgendamentoSchema = exports.createAgendamentoSchema = exports.agendaListQuerySchema = exports.agendamentoIdParamsSchema = void 0;
const zod_1 = require("zod");
/** Data/hora ISO; string que não vira data válida é recusada com `<campo> inválido`. */
const dateTime = (field) => zod_1.z.string({ error: `${field} inválido` })
    .transform((s) => new Date(s))
    .refine((d) => !Number.isNaN(d.getTime()), `${field} inválido`);
const title = zod_1.z.string({ error: 'title é obrigatório' }).trim().min(1, 'title é obrigatório');
/** Campos opcionais comuns a criação e edição. */
const details = {
    lead_id: zod_1.z.string({ error: 'lead_id inválido' }).max(100, 'lead_id inválido').nullish(),
    color: zod_1.z.string({ error: 'color inválida' }).max(20, 'color inválida').optional(),
    notes: zod_1.z.string({ error: 'notes inválido' }).nullish(),
    notify_on_create: zod_1.z.boolean({ error: 'notify_on_create inválido' }).optional(),
    reminder_minutes: zod_1.z.number({ error: 'reminder_minutes inválido' }).int('reminder_minutes inválido').min(0, 'reminder_minutes inválido').nullish(),
    remind_at_exact: zod_1.z.boolean({ error: 'remind_at_exact inválido' }).optional(),
    notify_groups: zod_1.z.array(zod_1.z.number({ error: 'notify_groups inválido' }).int('notify_groups inválido'), { error: 'notify_groups inválido' }).optional(),
};
exports.agendamentoIdParamsSchema = zod_1.z.object({
    id: zod_1.z.guid('id inválido'),
});
exports.agendaListQuerySchema = zod_1.z.object({
    start: dateTime('start').optional(),
    end: dateTime('end').optional(),
});
/** Presença de start_at/end_at e a ordem entre eles são regra do AgendaService. */
exports.createAgendamentoSchema = zod_1.z.object({
    title,
    start_at: dateTime('start_at').optional(),
    end_at: dateTime('end_at').optional(),
    ...details,
}, { error: 'Corpo da requisição inválido' });
exports.updateAgendamentoSchema = zod_1.z.object({
    title: title.optional(),
    start_at: dateTime('start_at').optional(),
    end_at: dateTime('end_at').optional(),
    ...details,
}, { error: 'Corpo da requisição inválido' });
//# sourceMappingURL=agenda.dto.js.map