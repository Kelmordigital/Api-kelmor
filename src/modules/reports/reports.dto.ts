import { z } from 'zod';

/** Tela de clientes pede 20 por página. */
export const CLIENT_REPORT_PAGINATION = { defaultLimit: 20, maxLimit: 100 };
/** Tempo médio: sem paginação pedida cabe a janela inteira de 90 dias (RN-REL-04). */
export const AVERAGE_REPORT_PAGINATION = { defaultLimit: 100, maxLimit: 100 };

const day = (field: string) => z.iso.date({ error: `${field} deve estar no formato AAAA-MM-DD` }).optional();
const id = (field: string) => z.coerce.number({ error: `${field} inválido` }).int(`${field} inválido`).positive(`${field} inválido`).optional();
const flag = z.unknown().optional().transform((v) => v === 'true' || v === true);

export const usersReportQuerySchema = z.object({
    dateStartParam: day('dateStartParam'),
    dateEndParam: day('dateEndParam'),
    excel: flag,
    pdf: flag,
});

export const clientReportQuerySchema = z.object({
    dateStartParam: day('dateStartParam'),
    dateEndParam: day('dateEndParam'),
    page: z.unknown().optional(),
    limit: z.unknown().optional(),
    excel: flag,
    pdf: flag,
});

export const averageReportQuerySchema = z.object({
    dateInit: day('dateInit'),
    dateEnd: day('dateEnd'),
    queueId: id('queueId'),
    connectionId: id('connectionId'),
    userId: z.guid('userId inválido').optional(),
    graph: flag,
    page: z.unknown().optional(),
    limit: z.unknown().optional(),
    excel: flag,
    pdf: flag,
});

export type AverageReportQuery = z.infer<typeof averageReportQuerySchema>;
