import { z } from 'zod';

export const TRIGGER_TYPES = ['keyword', 'message', 'welcome', 'scheduled', 'manual'] as const;

const id = (field: string) => z.coerce.number({ error: `${field} inválido` }).int(`${field} inválido`).positive(`${field} inválido`);

export const botIdParamsSchema = z.object({ id: id('id') });
export const rotateReportParamsSchema = z.object({ id: id('id'), nodeId: z.string().min(1).max(36) });

function isValidTimeZone(tz: string): boolean {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
        return true;
    } catch {
        return false;
    }
}

/** "HH:MM" de 00:00 a 23:59; vazio/null = dia sem atendimento. */
const hour = z.preprocess(
    (v) => (v === '' ? null : v),
    z.string({ error: 'Horário deve estar no formato HH:MM' }).regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário deve estar no formato HH:MM').nullable(),
);
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const schedule = Object.fromEntries(DAYS.flatMap((d) => [[`${d}_ini`, hour.optional()], [`${d}_fin`, hour.optional()]])) as
    Record<`${typeof DAYS[number]}_${'ini' | 'fin'}`, z.ZodOptional<typeof hour>>;

const optionalText = z.string().nullable().optional();

/** Campos editáveis do bot. Qualquer outro (id, company_id, deleted_at…) é ignorado. */
const botFields = {
    name: z.string({ error: 'name é obrigatório' }).trim().min(1, 'name é obrigatório').max(100, 'O nome do bot deve ter no máximo 100 caracteres'),
    description: optionalText,
    trigger_type: z.enum(TRIGGER_TYPES, { error: 'Gatilho inválido' }).optional(),
    keywords: optionalText,
    connection_id: z.number({ error: 'connection_id inválido' }).int('connection_id inválido').positive('connection_id inválido').nullable().optional(),
    active: z.boolean().optional(),
    default_bot: z.boolean().optional(),
    response_timer: z.number({ error: 'response_timer inválido' }).int('response_timer inválido').min(1, 'O tempo de resposta deve ser de ao menos 1 minuto').max(1440, 'O tempo de resposta deve ser de no máximo 1440 minutos').optional(),
    opening_hours: z.boolean().optional(),
    offline_message: optionalText,
    exit_message: optionalText,
    send_exit_message: z.boolean().optional(),
    timezone: z.string().refine(isValidTimeZone, 'Fuso horário inválido').optional(),
    ...schedule,
};

export const createBotSchema = z.object(botFields);
export const updateBotSchema = z.object({ ...botFields, name: botFields.name.optional() });

const nodeSchema = z.object({
    id: z.string({ error: 'Nó sem id' }).min(1, 'Nó sem id').max(36, 'id do nó deve ter no máximo 36 caracteres'),
    type: z.string({ error: 'Nó sem tipo' }).min(1, 'Nó sem tipo').max(20, 'Tipo de nó inválido'),
    label: z.string().max(100, 'O nome do nó deve ter no máximo 100 caracteres').default(''),
    message: z.string().nullable().optional(),
    order_index: z.number().int().default(0),
    next_node_id: z.string().max(36).nullable().optional(),
    delay_seconds: z.number().int().min(0).default(2),
    x: z.number().transform(Math.round).default(0),
    y: z.number().transform(Math.round).default(0),
    node_data: z.record(z.string(), z.unknown()).nullable().optional(),
    queue_id: z.number().int().positive().nullable().optional(),
});

export const syncNodesSchema = z.object({
    nodes: z.array(nodeSchema, { error: 'nodes deve ser um array' }),
});

export type CreateBotInput = z.infer<typeof createBotSchema>;
export type UpdateBotInput = z.infer<typeof updateBotSchema>;
export type NodeInput = z.infer<typeof nodeSchema>;
