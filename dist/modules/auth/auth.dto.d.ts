import { z } from 'zod';
export declare const loginSchema: z.ZodObject<{
    email: z.ZodPipe<z.ZodString, z.ZodEmail>;
    password: z.ZodString;
}, z.core.$strip>;
export declare const registerSchema: z.ZodObject<{
    name: z.ZodString;
    email: z.ZodPipe<z.ZodString, z.ZodEmail>;
    password: z.ZodString;
    profile_id: z.ZodNumber;
    company_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
export declare const totpCodeSchema: z.ZodObject<{
    code: z.ZodString;
}, z.core.$strip>;
export declare const loginTotpSchema: z.ZodObject<{
    ticket: z.ZodString;
    code: z.ZodString;
}, z.core.$strip>;
export declare const userIdParamsSchema: z.ZodObject<{
    id: z.ZodGUID;
}, z.core.$strip>;
export type RegisterInput = z.infer<typeof registerSchema>;
//# sourceMappingURL=auth.dto.d.ts.map