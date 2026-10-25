"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateScheduledMessageSchema = exports.scheduledIdParamsSchema = exports.scheduleMessageSchema = exports.ticketIdParamsSchema = exports.MESSAGE_MAX_LENGTH = void 0;
const zod_1 = require("zod");
exports.MESSAGE_MAX_LENGTH = 4096;
exports.ticketIdParamsSchema = zod_1.z.object({
    id: zod_1.z.coerce.number({ error: 'id inválido' }).int('id inválido').positive('id inválido'),
});
const message = zod_1.z.string({ error: 'message obrigatório' }).trim()
    .min(1, 'message obrigatório')
    .max(exports.MESSAGE_MAX_LENGTH, `A mensagem deve ter no máximo ${exports.MESSAGE_MAX_LENGTH} caracteres`);
const sendDate = zod_1.z.string({ error: 'send_date obrigatório' })
    .min(1, 'send_date obrigatório')
    .refine((s) => !Number.isNaN(new Date(s).getTime()), 'send_date inválido');
exports.scheduleMessageSchema = zod_1.z.object({ message, send_date: sendDate }, { error: 'message obrigatório' });
exports.scheduledIdParamsSchema = zod_1.z.object({
    id: zod_1.z.coerce.number({ error: 'id inválido' }).int('id inválido').positive('id inválido'),
});
exports.updateScheduledMessageSchema = zod_1.z.object({
    message: message.optional(),
    send_date: sendDate.optional(),
}, { error: 'Envie a mensagem e/ou a nova data' })
    .refine((v) => v.message !== undefined || v.send_date !== undefined, 'Envie a mensagem e/ou a nova data');
//# sourceMappingURL=agendamento-mensagens.dto.js.map