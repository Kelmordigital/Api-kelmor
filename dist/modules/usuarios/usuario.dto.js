"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateUserSchema = exports.createUserSchema = exports.userIdParamsSchema = void 0;
const zod_1 = require("zod");
const ids = (field) => zod_1.z.array(zod_1.z.number({ error: `${field} inválido` }).int(`${field} inválido`).positive(`${field} inválido`), { error: `${field} inválido` }).optional();
/** Só a forma; presença, formato de e-mail e força da senha são regras de UserAccountRules. */
const fields = {
    name: zod_1.z.string({ error: 'name inválido' }).optional(),
    email: zod_1.z.string({ error: 'E-mail inválido' }).optional(),
    password: zod_1.z.string({ error: 'password inválido' }).optional(),
    profile_id: zod_1.z.number({ error: 'Perfil inválido' }).int('Perfil inválido').optional(),
    queue_ids: ids('queue_ids'),
    connection_ids: ids('connection_ids'),
};
exports.userIdParamsSchema = zod_1.z.object({ id: zod_1.z.guid('id inválido') });
exports.createUserSchema = zod_1.z.object(fields, { error: 'Nome, e-mail e senha são obrigatórios' });
exports.updateUserSchema = zod_1.z.object(fields, { error: 'Corpo da requisição inválido' });
//# sourceMappingURL=usuario.dto.js.map