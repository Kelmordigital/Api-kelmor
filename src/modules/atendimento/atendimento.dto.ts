import { z } from 'zod';
import { optionalInt, optionalText, requiredId } from '../../core/validation/query-params';

/** Schemas aceitam tudo o que o front manda hoje (números chegam como string em query/params). */

export const ticketIdParams = z.object({ id: requiredId('id') });
export const contactIdParams = z.object({ contactId: requiredId('contactId') });

export const listTicketsQuery = z.object({
    status:       optionalText,
    search:       optionalText,
    connectionId: optionalInt('connectionId'),
    dateInit:     optionalText,
    dateEnd:      optionalText,
    limit:        optionalInt('limit'),
    offset:       optionalInt('offset'),
    queueId:      optionalInt('queueId'),
    userId:       optionalText,
    showAll:      optionalText,
    orderBy:      optionalText,
});

export const pageQuery = z.object({
    dateInit: optionalText,
    dateEnd:  optionalText,
    search:   optionalText,
    limit:    optionalInt('limit'),
    offset:   optionalInt('offset'),
});

export const transferBody = z.object({
    attendantId: z.string({ error: 'attendantId obrigatório' }).min(1, 'attendantId obrigatório'),
    queueId:     z.coerce.number({ error: 'queueId obrigatório' }).int('queueId obrigatório').positive('queueId obrigatório'),
});

export const closeBody = z.object({
    ocurrence:        z.string().nullish().transform((v) => v ?? undefined),
    service_not_made: z.boolean().optional(),
    sendGoodbye:      z.boolean().optional(),
}).nullish().transform((v) => v ?? {});

export const saleBody = z.object({
    isSale:          z.boolean({ error: 'isSale obrigatório' }),
    saleAmount:      z.string().nullish().transform((v) => v ?? undefined),
    lossReasonId:    z.coerce.number().int().nullish().transform((v) => v ?? undefined),
    lossProductName: z.string().nullish().transform((v) => v ?? undefined),
});

export const sendMessageBody = z.object({
    body:      z.string({ error: 'body obrigatório' }),
    fromMe:    z.boolean().default(true),
    contactId: z.coerce.number().int().nullish().transform((v) => v ?? undefined),
    hideName:  z.boolean().default(false),
});

export const funilCardsQuery = z.object({ search: optionalText });
export const funilAnalyticsQuery = z.object({ period: optionalText });

export const moveStageBody = z.object({
    destinationStageId: z.coerce.number({ error: 'destinationStageId obrigatório' }).int('destinationStageId obrigatório').positive('destinationStageId obrigatório'),
});

export const createStageBody = z.object({
    name:  z.string({ error: 'name obrigatório' }).trim().min(1, 'name obrigatório'),
    color: z.string().nullish().transform((v) => v?.trim() || 'bg-blue-500'),
});

export const updateStageBody = z.object({
    name:  z.string().nullish().transform((v) => v?.trim() || undefined),
    color: z.string().nullish().transform((v) => v?.trim() || undefined),
});

export const reorderStagesBody = z.object({
    orderedIds: z.array(z.coerce.number().int(), { error: 'orderedIds obrigatório' }),
});

export const createLeadBody = z.object({
    name:           z.string().nullish().transform((v) => v ?? undefined),
    phone:          z.string().nullish().transform((v) => v ?? undefined),
    email:          z.string().nullish().transform((v) => v ?? undefined),
    notes:          z.string().nullish().transform((v) => v ?? undefined),
    funil_stage_id: z.coerce.number().int().nullish().transform((v) => v ?? undefined),
});
