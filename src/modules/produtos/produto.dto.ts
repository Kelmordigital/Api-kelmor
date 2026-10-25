import { z } from 'zod';

export const VALUE_TYPES = ['valor_unico', 'recorrente', 'sem_valor'] as const;
export type ValueType = typeof VALUE_TYPES[number];

const name        = z.string({ error: 'name é obrigatório' }).trim().min(1, 'name é obrigatório');
const valueType   = z.enum(VALUE_TYPES, { error: 'value_type inválido' });
const value       = z.union([z.number(), z.string()]).nullish();
const text        = z.string().nullish();

export const produtoIdParamsSchema = z.object({
    id: z.guid('id inválido'),
});

export const createProdutoSchema = z.object({
    name,
    short_description:  text,
    value_type:         valueType.default('valor_unico'),
    value,
    delivery_timeframe: text,
    how_it_works:       text,
    full_description:   text,
});

export const updateProdutoSchema = z.object({
    name:               name.optional(),
    short_description:  text,
    value_type:         valueType.optional(),
    value,
    delivery_timeframe: text,
    how_it_works:       text,
    full_description:   text,
    is_active:          z.boolean().optional(),
});

export type CreateProdutoInput = z.infer<typeof createProdutoSchema>;
export type UpdateProdutoInput = z.infer<typeof updateProdutoSchema>;
