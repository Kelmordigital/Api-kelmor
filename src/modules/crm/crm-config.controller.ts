import { FastifyRequest, FastifyReply } from 'fastify';
import { crmConfigService } from './crm-config.service';

export const crmConfigController = {

    // ── Reasons ──────────────────────────────────────────────────────────────

    async listReasons(req: FastifyRequest, reply: FastifyReply) {
        const companyId = (req as any).user.company_id;
        return reply.send(await crmConfigService.listReasons(companyId));
    },

    async createReason(req: FastifyRequest, reply: FastifyReply) {
        const companyId = (req as any).user.company_id;
        const { reason, color } = req.body as { reason: string; color?: string };
        if (!reason?.trim()) return reply.status(400).send({ error: 'Motivo obrigatório' });
        return reply.status(201).send(await crmConfigService.createReason(companyId, reason.trim(), color));
    },

    async updateReason(req: FastifyRequest, reply: FastifyReply) {
        const companyId = (req as any).user.company_id;
        const { id } = req.params as { id: string };
        const { reason, color } = req.body as { reason: string; color?: string };
        const row = await crmConfigService.updateReason(Number(id), companyId, reason.trim(), color);
        if (!row) return reply.status(404).send({ error: 'Não encontrado' });
        return reply.send(row);
    },

    async deleteReason(req: FastifyRequest, reply: FastifyReply) {
        const companyId = (req as any).user.company_id;
        const { id } = req.params as { id: string };
        await crmConfigService.deleteReason(Number(id), companyId);
        return reply.send({ ok: true });
    },

    // ── Keywords ─────────────────────────────────────────────────────────────

    async listKeywords(req: FastifyRequest, reply: FastifyReply) {
        const companyId = (req as any).user.company_id;
        return reply.send(await crmConfigService.listKeywords(companyId));
    },

    async createKeyword(req: FastifyRequest, reply: FastifyReply) {
        const companyId = (req as any).user.company_id;
        const { keyword, origin } = req.body as { keyword: string; origin: string };
        if (!keyword?.trim() || !origin?.trim()) return reply.status(400).send({ error: 'Palavra-chave e origem obrigatórias' });
        return reply.status(201).send(await crmConfigService.createKeyword(companyId, keyword, origin));
    },

    async deleteKeyword(req: FastifyRequest, reply: FastifyReply) {
        const companyId = (req as any).user.company_id;
        const { id } = req.params as { id: string };
        await crmConfigService.deleteKeyword(Number(id), companyId);
        return reply.send({ ok: true });
    },
};
