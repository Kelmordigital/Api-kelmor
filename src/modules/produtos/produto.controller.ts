import { FastifyRequest, FastifyReply } from 'fastify';
import { produtoService } from './produto.service';

const VALID_VALUE_TYPES = ['valor_unico', 'recorrente', 'sem_valor'] as const;
type ValueType = typeof VALID_VALUE_TYPES[number];

export const produtoController = {

    async list(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const list = await produtoService.list(companyId);
        return reply.send(list);
    },

    async findById(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const { id } = req.params as { id: string };
        const row = await produtoService.findById(id, companyId);
        if (!row) return reply.status(404).send({ error: 'Produto não encontrado' });
        return reply.send(row);
    },

    async create(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const {
            name, short_description, value_type, value,
            delivery_timeframe, how_it_works, full_description,
        } = req.body as {
            name: string;
            short_description?: string | null;
            value_type?: ValueType;
            value?: number | null;
            delivery_timeframe?: string | null;
            how_it_works?: string | null;
            full_description?: string | null;
        };

        if (!name?.trim()) return reply.status(400).send({ error: 'name é obrigatório' });

        const vt = (value_type ?? 'valor_unico') as ValueType;
        if (!VALID_VALUE_TYPES.includes(vt)) {
            return reply.status(400).send({ error: 'value_type inválido' });
        }

        const row = await produtoService.create(companyId, {
            name:               name.trim(),
            short_description:  short_description ?? null,
            value_type:         vt,
            value:              vt === 'sem_valor' ? null : (value != null ? String(value) : null),
            delivery_timeframe: delivery_timeframe ?? null,
            how_it_works:       how_it_works ?? null,
            full_description:   full_description ?? null,
            is_active:          true,
        });
        return reply.status(201).send(row);
    },

    async update(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const { id } = req.params as { id: string };
        const body = req.body as {
            name?: string;
            short_description?: string | null;
            value_type?: ValueType;
            value?: number | null;
            delivery_timeframe?: string | null;
            how_it_works?: string | null;
            full_description?: string | null;
            is_active?: boolean;
        };

        if (body.value_type && !VALID_VALUE_TYPES.includes(body.value_type)) {
            return reply.status(400).send({ error: 'value_type inválido' });
        }

        const patch: Record<string, unknown> = { ...body };
        if (body.value !== undefined) {
            patch.value = body.value != null ? String(body.value) : null;
        }
        if (body.value_type === 'sem_valor') {
            patch.value = null;
        }

        const row = await produtoService.update(id, companyId, patch as Parameters<typeof produtoService.update>[2]);
        if (!row) return reply.status(404).send({ error: 'Produto não encontrado' });
        return reply.send(row);
    },

    async remove(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const { id } = req.params as { id: string };
        const ok = await produtoService.remove(id, companyId);
        if (!ok) return reply.status(404).send({ error: 'Produto não encontrado' });
        return reply.status(204).send();
    },
};
