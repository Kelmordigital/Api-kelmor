import { z } from 'zod';
export declare const researchIdParamsSchema: z.ZodObject<{
    id: z.ZodCoercedNumber<unknown>;
}, z.core.$strip>;
export declare const createResearchSchema: z.ZodObject<{
    type: z.ZodOptional<z.ZodString>;
    active: z.ZodOptional<z.ZodBoolean>;
    default_research: z.ZodOptional<z.ZodBoolean>;
    queue_ids: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
    name: z.ZodString;
    answers: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
/** Campos ausentes não mudam; `answers` e `queue_ids`, quando enviados, substituem a lista. */
export declare const updateResearchSchema: z.ZodObject<{
    type: z.ZodOptional<z.ZodString>;
    active: z.ZodOptional<z.ZodBoolean>;
    default_research: z.ZodOptional<z.ZodBoolean>;
    queue_ids: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
    name: z.ZodOptional<z.ZodString>;
    answers: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export declare const reportQuerySchema: z.ZodObject<{
    dateInit: z.ZodOptional<z.ZodString>;
    dateEnd: z.ZodOptional<z.ZodString>;
    userId: z.ZodOptional<z.ZodGUID>;
}, z.core.$strip>;
export declare const reportViewQuerySchema: z.ZodObject<{
    answerId: z.ZodCoercedNumber<unknown>;
    dateInit: z.ZodOptional<z.ZodString>;
    dateEnd: z.ZodOptional<z.ZodString>;
    limit: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    offset: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
export type CreateResearchInput = z.infer<typeof createResearchSchema>;
export type UpdateResearchInput = z.infer<typeof updateResearchSchema>;
export type ReportQuery = z.infer<typeof reportQuerySchema>;
export type ReportViewQuery = z.infer<typeof reportViewQuerySchema>;
//# sourceMappingURL=pesquisa.dto.d.ts.map