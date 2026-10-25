import { z } from 'zod';

/** E-mails valem sem diferenciar maiúsculas e sem espaços nas pontas. */
const email = z.string().trim().toLowerCase().pipe(z.email());

export const loginSchema = z.object({
    email,
    password: z.string().min(1),
});

export const registerSchema = z.object({
    name: z.string().trim().min(2),
    email,
    password: z.string().min(8),
    profile_id: z.number().int().min(1).max(3),
    company_id: z.string().uuid().nullable().optional(),
});

export const totpCodeSchema = z.object({
    code: z.string().min(6).max(9),
});

export const loginTotpSchema = z.object({
    ticket: z.string().min(10),
    code: z.string().min(6).max(9),
});

export const userIdParamsSchema = z.object({ id: z.guid('id inválido') });

export type RegisterInput = z.infer<typeof registerSchema>;
