import { z } from 'zod';

export const AVATAR_MIME_TYPES: ReadonlySet<string> = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const NICKNAME_MAX_LENGTH = 100;

const ids = (field: string) =>
    z.array(z.number({ error: `${field} inválido` }).int(`${field} inválido`), { error: `${field} inválido` }).optional();

export const updateMeuPerfilSchema = z.object({
    nickname:         z.string({ error: 'nickname inválido' })
        .refine((s) => s.trim().length <= NICKNAME_MAX_LENGTH, `nickname deve ter no máximo ${NICKNAME_MAX_LENGTH} caracteres`)
        .nullish(),
    hide_name_active: z.boolean({ error: 'hide_name_active inválido' }).optional(),
    queue_ids:        ids('queue_ids'),
    connection_ids:   ids('connection_ids'),
}, { error: 'Corpo da requisição inválido' });

export type UpdateMeuPerfilInput = z.infer<typeof updateMeuPerfilSchema>;
