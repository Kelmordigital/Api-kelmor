"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateMeuPerfilSchema = exports.NICKNAME_MAX_LENGTH = exports.AVATAR_MAX_BYTES = exports.AVATAR_MIME_TYPES = void 0;
const zod_1 = require("zod");
exports.AVATAR_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
exports.AVATAR_MAX_BYTES = 5 * 1024 * 1024;
exports.NICKNAME_MAX_LENGTH = 100;
const ids = (field) => zod_1.z.array(zod_1.z.number({ error: `${field} inválido` }).int(`${field} inválido`), { error: `${field} inválido` }).optional();
exports.updateMeuPerfilSchema = zod_1.z.object({
    nickname: zod_1.z.string({ error: 'nickname inválido' })
        .refine((s) => s.trim().length <= exports.NICKNAME_MAX_LENGTH, `nickname deve ter no máximo ${exports.NICKNAME_MAX_LENGTH} caracteres`)
        .nullish(),
    hide_name_active: zod_1.z.boolean({ error: 'hide_name_active inválido' }).optional(),
    queue_ids: ids('queue_ids'),
    connection_ids: ids('connection_ids'),
}, { error: 'Corpo da requisição inválido' });
//# sourceMappingURL=meu-perfil.dto.js.map