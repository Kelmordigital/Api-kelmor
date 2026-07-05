"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.produtoController = void 0;
const produto_service_1 = require("./produto.service");
const VALID_VALUE_TYPES = ['valor_unico', 'recorrente', 'sem_valor'];
exports.produtoController = {
    async list(req, reply) {
        const companyId = req.user.company_id;
        const list = await produto_service_1.produtoService.list(companyId);
        return reply.send(list);
    },
    async findById(req, reply) {
        const companyId = req.user.company_id;
        const { id } = req.params;
        const row = await produto_service_1.produtoService.findById(id, companyId);
        if (!row)
            return reply.status(404).send({ error: 'Produto não encontrado' });
        return reply.send(row);
    },
    async create(req, reply) {
        const companyId = req.user.company_id;
        const { name, short_description, value_type, value, delivery_timeframe, how_it_works, full_description, } = req.body;
        if (!name?.trim())
            return reply.status(400).send({ error: 'name é obrigatório' });
        const vt = (value_type ?? 'valor_unico');
        if (!VALID_VALUE_TYPES.includes(vt)) {
            return reply.status(400).send({ error: 'value_type inválido' });
        }
        const row = await produto_service_1.produtoService.create(companyId, {
            name: name.trim(),
            short_description: short_description ?? null,
            value_type: vt,
            value: vt === 'sem_valor' ? null : (value != null ? String(value) : null),
            delivery_timeframe: delivery_timeframe ?? null,
            how_it_works: how_it_works ?? null,
            full_description: full_description ?? null,
            is_active: true,
        });
        return reply.status(201).send(row);
    },
    async update(req, reply) {
        const companyId = req.user.company_id;
        const { id } = req.params;
        const body = req.body;
        if (body.value_type && !VALID_VALUE_TYPES.includes(body.value_type)) {
            return reply.status(400).send({ error: 'value_type inválido' });
        }
        const patch = { ...body };
        if (body.value !== undefined) {
            patch.value = body.value != null ? String(body.value) : null;
        }
        if (body.value_type === 'sem_valor') {
            patch.value = null;
        }
        const row = await produto_service_1.produtoService.update(id, companyId, patch);
        if (!row)
            return reply.status(404).send({ error: 'Produto não encontrado' });
        return reply.send(row);
    },
    async remove(req, reply) {
        const companyId = req.user.company_id;
        const { id } = req.params;
        const ok = await produto_service_1.produtoService.remove(id, companyId);
        if (!ok)
            return reply.status(404).send({ error: 'Produto não encontrado' });
        return reply.status(204).send();
    },
};
//# sourceMappingURL=produto.controller.js.map