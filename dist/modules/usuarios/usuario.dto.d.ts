import { z } from 'zod';
export declare const userIdParamsSchema: z.ZodObject<{
    id: z.ZodGUID;
}, z.core.$strip>;
export declare const createUserSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    password: z.ZodOptional<z.ZodString>;
    profile_id: z.ZodOptional<z.ZodNumber>;
    queue_ids: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
    connection_ids: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
}, z.core.$strip>;
export declare const updateUserSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    password: z.ZodOptional<z.ZodString>;
    profile_id: z.ZodOptional<z.ZodNumber>;
    queue_ids: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
    connection_ids: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
}, z.core.$strip>;
export type UserInput = z.infer<typeof createUserSchema>;
//# sourceMappingURL=usuario.dto.d.ts.map