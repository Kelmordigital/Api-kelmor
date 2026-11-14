import { z } from 'zod';
import { SalePrice } from './sale-price';

const id = (field: string) => z.coerce.number({ error: `${field} inválido` }).int(`${field} inválido`).positive(`${field} inválido`);

export const CRM_REPORT_PAGINATION = { defaultLimit: 10, maxLimit: 100 };

export const reasonIdParamsSchema = z.object({ id: id('id') });
export const keywordIdParamsSchema = z.object({ id: id('id') });
export const ticketIdParamsSchema = z.object({ ticketId: id('ticketId') });
export const contactIdParamsSchema = z.object({ contactId: id('contactId') });

const reasonText = z.string({ error: 'Motivo obrigatório' }).trim().min(1, 'Motivo obrigatório').max(255, 'O motivo deve ter no máximo 255 caracteres');
const color = z.string().trim().max(50, 'A cor deve ter no máximo 50 caracteres').nullable().optional();

export const createReasonSchema = z.object({ reason: reasonText, color });
export const updateReasonSchema = z.object({ reason: reasonText.optional(), color });

const keywordMessage = 'Palavra-chave e origem obrigatórias';
export const createKeywordSchema = z.object({
    keyword: z.string({ error: keywordMessage }).trim().toLowerCase().min(1, keywordMessage).max(255, 'A palavra-chave deve ter no máximo 255 caracteres'),
    origin: z.string({ error: keywordMessage }).trim().min(1, keywordMessage).max(255, 'A origem deve ter no máximo 255 caracteres'),
});

export const noteSchema = z.object({
    body: z.string({ error: 'body obrigatório' }).trim().min(1, 'body obrigatório').max(5000, 'A anotação deve ter no máximo 5000 caracteres'),
});

const day = (field: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${field} deve estar no formato AAAA-MM-DD`).optional();

export const salesReportQuerySchema = z.object({
    dateInit: day('dateInit'),
    dateEnd: day('dateEnd'),
    userId: z.guid('userId inválido').optional(),
    queueId: id('queueId').optional(),
    page: z.unknown().optional(),
    perPage: z.unknown().optional(),
});

export const updateSaleSchema = z.object({
    isSale: z.boolean({ error: 'isSale deve ser verdadeiro ou falso' }),
    salePrice: z.string().trim().refine((v) => v === '' || SalePrice.isValid(v), SalePrice.FORMAT_MESSAGE).nullable().optional(),
    reasonId: id('reasonId').nullable().optional(),
});

export type CreateReasonInput = z.infer<typeof createReasonSchema>;
export type UpdateReasonInput = z.infer<typeof updateReasonSchema>;
export type CreateKeywordInput = z.infer<typeof createKeywordSchema>;
export type SalesReportQuery = z.infer<typeof salesReportQuerySchema>;
export type UpdateSaleInput = z.infer<typeof updateSaleSchema>;
