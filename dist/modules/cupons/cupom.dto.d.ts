import { z } from 'zod';
export declare const cupomIdParamsSchema: z.ZodObject<{
    id: z.ZodGUID;
}, z.core.$strip>;
export declare const cupomInputSchema: z.ZodObject<{
    code: z.ZodOptional<z.ZodString>;
    type: z.ZodOptional<z.ZodString>;
    value: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    gift_description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    min_sale_value: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    is_public: z.ZodOptional<z.ZodBoolean>;
    is_active: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export type CupomInput = z.infer<typeof cupomInputSchema>;
//# sourceMappingURL=cupom.dto.d.ts.map