import { z } from 'zod';
export declare const etiquetaIdParamsSchema: z.ZodObject<{
    id: z.ZodGUID;
}, z.core.$strip>;
export declare const contactParamsSchema: z.ZodObject<{
    contactId: z.ZodCoercedNumber<unknown>;
}, z.core.$strip>;
export declare const contactEtiquetaParamsSchema: z.ZodObject<{
    contactId: z.ZodCoercedNumber<unknown>;
    etiquetaId: z.ZodGUID;
}, z.core.$strip>;
export declare const createEtiquetaSchema: z.ZodObject<{
    name: z.ZodString;
    color: z.ZodOptional<z.ZodString>;
    icon: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const updateEtiquetaSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    color: z.ZodOptional<z.ZodString>;
    icon: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const ruleIdParamsSchema: z.ZodObject<{
    id: z.ZodCoercedNumber<unknown>;
}, z.core.$strip>;
/** PUT substitui a regra inteira: sem etiqueta_ids, a regra fica sem etiquetas. */
export declare const automaticTagRuleSchema: z.ZodObject<{
    keywords: z.ZodString;
    etiqueta_ids: z.ZodOptional<z.ZodArray<z.ZodGUID>>;
}, z.core.$strip>;
export type CreateEtiquetaInput = z.infer<typeof createEtiquetaSchema>;
export type UpdateEtiquetaInput = z.infer<typeof updateEtiquetaSchema>;
//# sourceMappingURL=etiqueta.dto.d.ts.map