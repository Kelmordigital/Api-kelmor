import { FastifyRequest, FastifyReply } from 'fastify';
import { cupomService } from './cupom.service';
import { CUPOM_TYPES, CupomType } from './cupom.db.schema';

interface CupomBody {
    code?: string;
    type?: CupomType;
    value?: number | null;
    gift_description?: string | null;
    min_sale_value?: number | null;
    is_public?: boolean;
    is_active?: boolean;
}

function validatePayload(body: CupomBody): string | null {
    if (!body.code?.trim()) return 'code é obrigatório';
    if (body.code.trim().length > 50) return 'code não pode passar de 50 caracteres';

    const type = body.type ?? 'percentual';
    if (!CUPOM_TYPES.includes(type)) return 'type inválido';

    if (type === 'fixo' || type === 'percentual') {
        if (body.value == null || body.value <= 0) return 'value deve ser maior que zero para este tipo de cupom';
        if (type === 'percentual' && (body.value < 1 || body.value > 100)) return 'value (percentual) deve estar entre 1 e 100';
    }

    if (type === 'brinde' && !body.gift_description?.trim()) {
        return 'gift_description é obrigatório para cupons do tipo brinde';
    }

    if (body.min_sale_value != null && body.min_sale_value < 0) return 'min_sale_value não pode ser negativo';

    return null;
}

function toRow(body: CupomBody) {
    const type = (body.type ?? 'percentual') as CupomType;
    return {
        code:              body.code!.trim().toUpperCase(),
        type,
        value:             type === 'brinde' ? null : (body.value != null ? String(body.value) : null),
        gift_description:  type === 'brinde' ? (body.gift_description?.trim() ?? null) : null,
        min_sale_value:    body.min_sale_value != null ? String(body.min_sale_value) : null,
        is_public:         body.is_public ?? false,
        is_active:         body.is_active ?? true,
    };
}

export const cupomController = {

    async list(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const list = await cupomService.list(companyId);
        return reply.send(list);
    },

    async create(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const body = req.body as CupomBody;

        const error = validatePayload(body);
        if (error) return reply.status(400).send({ error });

        const row = toRow(body);
        if (await cupomService.isCodeTaken(companyId, row.code)) {
            return reply.status(409).send({ error: 'Já existe um cupom com esse código' });
        }

        const created = await cupomService.create(companyId, row);
        return reply.status(201).send(created);
    },

    async update(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const { id } = req.params as { id: string };
        const body = req.body as CupomBody;

        const existing = await cupomService.findById(id, companyId);
        if (!existing) return reply.status(404).send({ error: 'Cupom não encontrado' });

        const typeChanged = body.type !== undefined && body.type !== existing.type;

        const merged: CupomBody = {
            code:              body.code ?? existing.code,
            type:              body.type ?? (existing.type as CupomType),
            value:             body.value !== undefined ? body.value : (typeChanged ? null : (existing.value != null ? Number(existing.value) : null)),
            gift_description:  body.gift_description !== undefined ? body.gift_description : existing.gift_description,
            min_sale_value:    body.min_sale_value !== undefined ? body.min_sale_value : (existing.min_sale_value != null ? Number(existing.min_sale_value) : null),
            is_public:         body.is_public !== undefined ? body.is_public : existing.is_public,
            is_active:         body.is_active !== undefined ? body.is_active : existing.is_active,
        };

        const error = validatePayload(merged);
        if (error) return reply.status(400).send({ error });

        const row = toRow(merged);
        if (await cupomService.isCodeTaken(companyId, row.code, id)) {
            return reply.status(409).send({ error: 'Já existe um cupom com esse código' });
        }

        const updated = await cupomService.update(id, companyId, row);
        if (!updated) return reply.status(404).send({ error: 'Cupom não encontrado' });
        return reply.send(updated);
    },

    async remove(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const { id } = req.params as { id: string };
        const ok = await cupomService.remove(id, companyId);
        if (!ok) return reply.status(404).send({ error: 'Cupom não encontrado' });
        return reply.status(204).send();
    },
};
