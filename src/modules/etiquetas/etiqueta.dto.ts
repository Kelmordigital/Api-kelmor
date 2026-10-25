import { z } from 'zod';

const name = z.string({ error: 'name é obrigatório' }).trim()
    .min(1, 'name é obrigatório')
    .max(100, 'name deve ter no máximo 100 caracteres');
const color = z.string({ error: 'color inválida' }).max(20, 'color inválida');
const icon = z.string({ error: 'icon inválido' }).max(50, 'icon inválido');

export const etiquetaIdParamsSchema = z.object({ id: z.guid('id inválido') });

export const contactParamsSchema = z.object({
    contactId: z.coerce.number({ error: 'contactId inválido' }).int('contactId inválido').positive('contactId inválido'),
});

export const contactEtiquetaParamsSchema = contactParamsSchema.extend({
    etiquetaId: z.guid('etiquetaId inválido'),
});

export const createEtiquetaSchema = z.object({
    name,
    color: color.optional(),
    icon:  icon.optional(),
}, { error: 'name é obrigatório' });

export const updateEtiquetaSchema = z.object({
    name:  name.optional(),
    color: color.optional(),
    icon:  icon.optional(),
}, { error: 'Corpo da requisição inválido' });

export const ruleIdParamsSchema = z.object({
    id: z.coerce.number({ error: 'id inválido' }).int('id inválido').positive('id inválido'),
});

/** PUT substitui a regra inteira: sem etiqueta_ids, a regra fica sem etiquetas. */
export const automaticTagRuleSchema = z.object({
    keywords:     z.string({ error: 'keywords é obrigatório' }).trim().min(1, 'keywords é obrigatório'),
    etiqueta_ids: z.array(z.guid('etiqueta_ids inválido'), { error: 'etiqueta_ids inválido' }).optional(),
}, { error: 'keywords é obrigatório' });

export type CreateEtiquetaInput = z.infer<typeof createEtiquetaSchema>;
export type UpdateEtiquetaInput = z.infer<typeof updateEtiquetaSchema>;
