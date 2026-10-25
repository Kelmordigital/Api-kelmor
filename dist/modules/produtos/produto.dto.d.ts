import { z } from 'zod';
export declare const VALUE_TYPES: readonly ["valor_unico", "recorrente", "sem_valor"];
export type ValueType = typeof VALUE_TYPES[number];
export declare const produtoIdParamsSchema: z.ZodObject<{
    id: z.ZodGUID;
}, z.core.$strip>;
export declare const createProdutoSchema: z.ZodObject<{
    name: z.ZodString;
    short_description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    value_type: z.ZodDefault<z.ZodEnum<{
        valor_unico: "valor_unico";
        recorrente: "recorrente";
        sem_valor: "sem_valor";
    }>>;
    value: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>>;
    delivery_timeframe: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    how_it_works: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    full_description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
export declare const updateProdutoSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    short_description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    value_type: z.ZodOptional<z.ZodEnum<{
        valor_unico: "valor_unico";
        recorrente: "recorrente";
        sem_valor: "sem_valor";
    }>>;
    value: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>>;
    delivery_timeframe: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    how_it_works: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    full_description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    is_active: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export type CreateProdutoInput = z.infer<typeof createProdutoSchema>;
export type UpdateProdutoInput = z.infer<typeof updateProdutoSchema>;
//# sourceMappingURL=produto.dto.d.ts.map