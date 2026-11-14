import { z } from 'zod';

/** Ausente → a mensagem de "obrigatório" da rota; presente e malformado → "connectionId inválido". */
const connectionId = (missing: string) => z.unknown().optional().transform((value, ctx) => {
    if (value === undefined || value === null || value === '') {
        ctx.addIssue({ code: 'custom', message: missing });
        return z.NEVER;
    }
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) {
        ctx.addIssue({ code: 'custom', message: 'connectionId inválido' });
        return z.NEVER;
    }
    return id;
});

const optionalText = z.string().trim().optional().transform((v) => v || undefined);

const connectionMessage = 'Informe o code do Embedded Signup ou wabaId + phoneNumberId';
export const createConnectionSchema = z.object({
    code: optionalText,
    name: optionalText,
    wabaId: optionalText,
    phoneNumberId: optionalText,
    token: optionalText,
}).refine((v) => v.code || (v.wabaId && v.phoneNumberId), connectionMessage);

export const templatesQuerySchema = z.object({ connectionId: connectionId('connectionId é obrigatório') });

const templateMessage = 'connectionId e name são obrigatórios';
export const createTemplateSchema = z.object({
    connectionId: connectionId(templateMessage),
    name: z.string({ error: templateMessage }).trim().min(1, templateMessage),
    language: z.string().trim().min(1).default('pt_BR'),
    category: z.enum(['AUTHENTICATION', 'MARKETING', 'UTILITY'], { error: 'category deve ser AUTHENTICATION, MARKETING ou UTILITY' }).default('UTILITY'),
    components: z.array(z.unknown(), { error: 'components deve ser uma lista' }).default([]),
});

export const templateNameParamsSchema = z.object({ name: z.string().min(1) });

const sendMessage = 'connectionId, to e template são obrigatórios';
export const sendTemplateSchema = z.object({
    connectionId: connectionId(sendMessage),
    to: z.string({ error: sendMessage }).min(1, sendMessage)
        .refine((v) => /^\d{10,15}$/.test(v.replace(/\D/g, '')), 'Número inválido'),
    template: z.string({ error: sendMessage }).trim().min(1, sendMessage),
    language: z.string().trim().min(1).default('pt_BR'),
    components: z.array(z.unknown(), { error: 'components deve ser uma lista' }).optional(),
});

export type CreateConnectionInput = z.infer<typeof createConnectionSchema>;
export type CreateTemplateInput = Omit<z.infer<typeof createTemplateSchema>, 'connectionId'>;
