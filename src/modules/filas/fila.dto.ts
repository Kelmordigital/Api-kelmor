import { z } from 'zod';

export const DISTRIBUTION_MODES = ['none', 'less_attendances', 'time', 'attendant'] as const;
export type DistributionMode = typeof DISTRIBUTION_MODES[number];

export const FILA_PAGINATION = { defaultLimit: 20, maxLimit: 100 };

const id = (field: string) => z.coerce.number({ error: `${field} inválido` }).int(`${field} inválido`);

export const filaIdParamsSchema = z.object({ id: id('id').positive('id inválido') });

/** connectionId 0 = ticket sem conexão: vale só a fila. */
export const eligibleUsersParamsSchema = z.object({
    id: id('id').positive('id inválido'),
    connectionId: id('connectionId').min(0, 'connectionId inválido'),
});

export const filaListQuerySchema = z.object({
    page:    z.unknown().optional(),
    perPage: z.unknown().optional(),
    search:  z.string().optional(),
});

const name = z.string({ error: 'name é obrigatório' }).trim()
    .min(1, 'name é obrigatório')
    .max(255, 'O nome da fila deve ter no máximo 255 caracteres');
const color = z.string().trim().max(50, 'A cor deve ter no máximo 50 caracteres').nullable();
/** Saudação vazia (ou só espaços) = sem saudação. */
const greeting = z.string().nullable().transform((v) => v?.trim() || null);
const distribution = z.enum(DISTRIBUTION_MODES, { error: 'Modo de distribuição inválido' });

export const createFilaSchema = z.object({
    name,
    color: color.optional().transform((v) => v ?? null),
    greeting_message: greeting.optional().transform((v) => v ?? null),
    enabled: z.boolean('enabled deve ser verdadeiro ou falso').optional().default(true),
    distribution: distribution.optional().default('none'),
});

export const updateFilaSchema = z.object({
    name: name.optional(),
    color: color.optional(),
    greeting_message: greeting.optional(),
    enabled: z.boolean('enabled deve ser verdadeiro ou falso').optional(),
    distribution: distribution.optional(),
});

export type CreateFilaInput = z.infer<typeof createFilaSchema>;
export type UpdateFilaInput = z.infer<typeof updateFilaSchema>;
