import { z } from 'zod';

const ids = (field: string) =>
    z.array(z.number({ error: `${field} inválido` }).int(`${field} inválido`).positive(`${field} inválido`), { error: `${field} inválido` }).optional();

/** Só a forma; presença, formato de e-mail e força da senha são regras de UserAccountRules. */
const fields = {
    name:           z.string({ error: 'name inválido' }).optional(),
    email:          z.string({ error: 'E-mail inválido' }).optional(),
    password:       z.string({ error: 'password inválido' }).optional(),
    profile_id:     z.number({ error: 'Perfil inválido' }).int('Perfil inválido').optional(),
    queue_ids:      ids('queue_ids'),
    connection_ids: ids('connection_ids'),
};

export const userIdParamsSchema = z.object({ id: z.guid('id inválido') });
export const createUserSchema = z.object(fields, { error: 'Nome, e-mail e senha são obrigatórios' });
export const updateUserSchema = z.object(fields, { error: 'Corpo da requisição inválido' });

export type UserInput = z.infer<typeof createUserSchema>;
