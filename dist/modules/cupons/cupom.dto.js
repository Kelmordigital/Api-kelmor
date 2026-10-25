"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cupomInputSchema = exports.cupomIdParamsSchema = void 0;
const zod_1 = require("zod");
/**
 * Só a forma da entrada. Presença, limites e regras por tipo ficam em
 * CupomDefinition/CupomTypePolicy — a ordem das mensagens é regra de domínio.
 */
const amount = (field) => zod_1.z.number({ error: `${field} deve ser um número` }).nullish();
exports.cupomIdParamsSchema = zod_1.z.object({
    id: zod_1.z.guid('id inválido'),
});
exports.cupomInputSchema = zod_1.z.object({
    code: zod_1.z.string({ error: 'code é obrigatório' }).optional(),
    type: zod_1.z.string({ error: 'type inválido' }).optional(),
    value: amount('value'),
    gift_description: zod_1.z.string({ error: 'gift_description deve ser texto' }).nullish(),
    min_sale_value: amount('min_sale_value'),
    is_public: zod_1.z.boolean().optional(),
    is_active: zod_1.z.boolean().optional(),
}, { error: 'Corpo da requisição inválido' });
//# sourceMappingURL=cupom.dto.js.map