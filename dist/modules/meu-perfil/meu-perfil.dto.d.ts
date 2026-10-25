import { z } from 'zod';
export declare const AVATAR_MIME_TYPES: ReadonlySet<string>;
export declare const AVATAR_MAX_BYTES: number;
export declare const NICKNAME_MAX_LENGTH = 100;
export declare const updateMeuPerfilSchema: z.ZodObject<{
    nickname: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    hide_name_active: z.ZodOptional<z.ZodBoolean>;
    queue_ids: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
    connection_ids: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
}, z.core.$strip>;
export type UpdateMeuPerfilInput = z.infer<typeof updateMeuPerfilSchema>;
//# sourceMappingURL=meu-perfil.dto.d.ts.map