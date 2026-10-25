import { z } from 'zod';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const requiredText = (field: string, max: number) =>
    z.string({ error: `${field} é obrigatório` })
        .trim()
        .min(1, `${field} é obrigatório`)
        .max(max, `${field} deve ter no máximo ${max} caracteres`);

const dateTime = (field: string) =>
    z.string({ error: `${field} inválido` })
        .transform((s) => new Date(s))
        .refine((d) => !Number.isNaN(d.getTime()), `${field} inválido`);

const contactId = z.number({ error: 'contact_id inválido' }).int('contact_id inválido').positive('contact_id inválido');
const flag = (field: string) => z.boolean({ error: `${field} inválido` }).optional();

export const idParamsSchema = z.object({ id: z.guid('id inválido') });

export const contactParamsSchema = z.object({
    contactId: z.coerce.number({ error: 'contactId inválido' }).int('contactId inválido').positive('contactId inválido'),
});

export const ownerQuerySchema = z.object({
    owner_id: z.guid('owner_id inválido').optional(),
});

export const createTaskSchema = z.object({
    titulo:     requiredText('titulo', 255),
    descricao:  z.string({ error: 'descricao inválido' }).nullish(),
    contact_id: contactId.nullish(),
    due_date:   dateTime('due_date').nullish(),
    // Coluna que não é do quadro do usuário é ignorada (a tarefa cai na Pilha de Ação)
    column_id:  z.string({ error: 'column_id inválido' }).optional(),
}, { error: 'Corpo da requisição inválido' });

export const updateTaskSchema = z.object({
    titulo:     requiredText('titulo', 255).optional(),
    descricao:  z.string({ error: 'descricao inválido' }).nullish(),
    contact_id: contactId.nullish(),
    due_date:   dateTime('due_date').nullish(),
}, { error: 'Corpo da requisição inválido' });

export const moveTaskSchema = z.object({
    column_id: z.string({ error: 'column_id é obrigatório' }).min(1, 'column_id é obrigatório').regex(GUID, 'column_id inválido'),
    index:     z.number({ error: 'index inválido' }).int('index inválido').min(0, 'index inválido').optional(),
}, { error: 'column_id é obrigatório' });

/** Corpo opcional: sem `done`/`archived`, vale true. */
export const setDoneSchema = z.object({ done: flag('done') }, { error: 'done inválido' }).nullish();
export const setArchivedSchema = z.object({ archived: flag('archived') }, { error: 'archived inválido' }).nullish();

export const columnSchema = z.object({ title: requiredText('title', 100) }, { error: 'title é obrigatório' });

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
