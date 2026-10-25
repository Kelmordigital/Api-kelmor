"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.columnSchema = exports.setArchivedSchema = exports.setDoneSchema = exports.moveTaskSchema = exports.updateTaskSchema = exports.createTaskSchema = exports.ownerQuerySchema = exports.contactParamsSchema = exports.idParamsSchema = void 0;
const zod_1 = require("zod");
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const requiredText = (field, max) => zod_1.z.string({ error: `${field} é obrigatório` })
    .trim()
    .min(1, `${field} é obrigatório`)
    .max(max, `${field} deve ter no máximo ${max} caracteres`);
const dateTime = (field) => zod_1.z.string({ error: `${field} inválido` })
    .transform((s) => new Date(s))
    .refine((d) => !Number.isNaN(d.getTime()), `${field} inválido`);
const contactId = zod_1.z.number({ error: 'contact_id inválido' }).int('contact_id inválido').positive('contact_id inválido');
const flag = (field) => zod_1.z.boolean({ error: `${field} inválido` }).optional();
exports.idParamsSchema = zod_1.z.object({ id: zod_1.z.guid('id inválido') });
exports.contactParamsSchema = zod_1.z.object({
    contactId: zod_1.z.coerce.number({ error: 'contactId inválido' }).int('contactId inválido').positive('contactId inválido'),
});
exports.ownerQuerySchema = zod_1.z.object({
    owner_id: zod_1.z.guid('owner_id inválido').optional(),
});
exports.createTaskSchema = zod_1.z.object({
    titulo: requiredText('titulo', 255),
    descricao: zod_1.z.string({ error: 'descricao inválido' }).nullish(),
    contact_id: contactId.nullish(),
    due_date: dateTime('due_date').nullish(),
    // Coluna que não é do quadro do usuário é ignorada (a tarefa cai na Pilha de Ação)
    column_id: zod_1.z.string({ error: 'column_id inválido' }).optional(),
}, { error: 'Corpo da requisição inválido' });
exports.updateTaskSchema = zod_1.z.object({
    titulo: requiredText('titulo', 255).optional(),
    descricao: zod_1.z.string({ error: 'descricao inválido' }).nullish(),
    contact_id: contactId.nullish(),
    due_date: dateTime('due_date').nullish(),
}, { error: 'Corpo da requisição inválido' });
exports.moveTaskSchema = zod_1.z.object({
    column_id: zod_1.z.string({ error: 'column_id é obrigatório' }).min(1, 'column_id é obrigatório').regex(GUID, 'column_id inválido'),
    index: zod_1.z.number({ error: 'index inválido' }).int('index inválido').min(0, 'index inválido').optional(),
}, { error: 'column_id é obrigatório' });
/** Corpo opcional: sem `done`/`archived`, vale true. */
exports.setDoneSchema = zod_1.z.object({ done: flag('done') }, { error: 'done inválido' }).nullish();
exports.setArchivedSchema = zod_1.z.object({ archived: flag('archived') }, { error: 'archived inválido' }).nullish();
exports.columnSchema = zod_1.z.object({ title: requiredText('title', 100) }, { error: 'title é obrigatório' });
//# sourceMappingURL=tarefas.dto.js.map