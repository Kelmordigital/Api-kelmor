import { z } from 'zod';

export const MESSAGE_MAX_LENGTH = 4096;

export const ticketIdParamsSchema = z.object({
    id: z.coerce.number({ error: 'id inválido' }).int('id inválido').positive('id inválido'),
});

const message = z.string({ error: 'message obrigatório' }).trim()
    .min(1, 'message obrigatório')
    .max(MESSAGE_MAX_LENGTH, `A mensagem deve ter no máximo ${MESSAGE_MAX_LENGTH} caracteres`);
const sendDate = z.string({ error: 'send_date obrigatório' })
    .min(1, 'send_date obrigatório')
    .refine((s) => !Number.isNaN(new Date(s).getTime()), 'send_date inválido');

export const scheduleMessageSchema = z.object({ message, send_date: sendDate }, { error: 'message obrigatório' });

export const scheduledIdParamsSchema = z.object({
    id: z.coerce.number({ error: 'id inválido' }).int('id inválido').positive('id inválido'),
});

export const updateScheduledMessageSchema = z.object({
    message:   message.optional(),
    send_date: sendDate.optional(),
}, { error: 'Envie a mensagem e/ou a nova data' })
    .refine((v) => v.message !== undefined || v.send_date !== undefined, 'Envie a mensagem e/ou a nova data');
