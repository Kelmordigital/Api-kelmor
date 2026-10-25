"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.automaticTagRuleSchema = exports.ruleIdParamsSchema = exports.updateEtiquetaSchema = exports.createEtiquetaSchema = exports.contactEtiquetaParamsSchema = exports.contactParamsSchema = exports.etiquetaIdParamsSchema = void 0;
const zod_1 = require("zod");
const name = zod_1.z.string({ error: 'name é obrigatório' }).trim()
    .min(1, 'name é obrigatório')
    .max(100, 'name deve ter no máximo 100 caracteres');
const color = zod_1.z.string({ error: 'color inválida' }).max(20, 'color inválida');
const icon = zod_1.z.string({ error: 'icon inválido' }).max(50, 'icon inválido');
exports.etiquetaIdParamsSchema = zod_1.z.object({ id: zod_1.z.guid('id inválido') });
exports.contactParamsSchema = zod_1.z.object({
    contactId: zod_1.z.coerce.number({ error: 'contactId inválido' }).int('contactId inválido').positive('contactId inválido'),
});
exports.contactEtiquetaParamsSchema = exports.contactParamsSchema.extend({
    etiquetaId: zod_1.z.guid('etiquetaId inválido'),
});
exports.createEtiquetaSchema = zod_1.z.object({
    name,
    color: color.optional(),
    icon: icon.optional(),
}, { error: 'name é obrigatório' });
exports.updateEtiquetaSchema = zod_1.z.object({
    name: name.optional(),
    color: color.optional(),
    icon: icon.optional(),
}, { error: 'Corpo da requisição inválido' });
exports.ruleIdParamsSchema = zod_1.z.object({
    id: zod_1.z.coerce.number({ error: 'id inválido' }).int('id inválido').positive('id inválido'),
});
/** PUT substitui a regra inteira: sem etiqueta_ids, a regra fica sem etiquetas. */
exports.automaticTagRuleSchema = zod_1.z.object({
    keywords: zod_1.z.string({ error: 'keywords é obrigatório' }).trim().min(1, 'keywords é obrigatório'),
    etiqueta_ids: zod_1.z.array(zod_1.z.guid('etiqueta_ids inválido'), { error: 'etiqueta_ids inválido' }).optional(),
}, { error: 'keywords é obrigatório' });
//# sourceMappingURL=etiqueta.dto.js.map