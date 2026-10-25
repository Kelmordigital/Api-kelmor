"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateProdutoSchema = exports.createProdutoSchema = exports.produtoIdParamsSchema = exports.VALUE_TYPES = void 0;
const zod_1 = require("zod");
exports.VALUE_TYPES = ['valor_unico', 'recorrente', 'sem_valor'];
const name = zod_1.z.string({ error: 'name é obrigatório' }).trim().min(1, 'name é obrigatório');
const valueType = zod_1.z.enum(exports.VALUE_TYPES, { error: 'value_type inválido' });
const value = zod_1.z.union([zod_1.z.number(), zod_1.z.string()]).nullish();
const text = zod_1.z.string().nullish();
exports.produtoIdParamsSchema = zod_1.z.object({
    id: zod_1.z.guid('id inválido'),
});
exports.createProdutoSchema = zod_1.z.object({
    name,
    short_description: text,
    value_type: valueType.default('valor_unico'),
    value,
    delivery_timeframe: text,
    how_it_works: text,
    full_description: text,
});
exports.updateProdutoSchema = zod_1.z.object({
    name: name.optional(),
    short_description: text,
    value_type: valueType.optional(),
    value,
    delivery_timeframe: text,
    how_it_works: text,
    full_description: text,
    is_active: zod_1.z.boolean().optional(),
});
//# sourceMappingURL=produto.dto.js.map