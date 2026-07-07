import { FastifyRequest, FastifyReply } from 'fastify';
import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { and, desc, eq, max, sql } from 'drizzle-orm';
import { db } from '../../database/client';
import { bot_rotate_log } from './bots.db.schema';
import { botsService } from './bots.service';

const UPLOAD_MAX_BYTES = 25 * 1024 * 1024; // 25MB

export const botsController = {

    async list(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        return reply.send(await botsService.list(companyId));
    },

    async create(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const body = req.body as any;
        if (!body?.name?.trim()) return reply.status(400).send({ error: 'name é obrigatório' });
        const bot = await botsService.create(companyId, body);
        return reply.status(201).send(bot);
    },

    async update(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const companyId = req.user.company_id!;
        return reply.send(await botsService.update(Number(id), companyId, req.body as any));
    },

    async remove(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const companyId = req.user.company_id!;
        await botsService.delete(Number(id), companyId);
        return reply.send({ ok: true });
    },

    async toggleActive(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const companyId = req.user.company_id!;
        return reply.send(await botsService.toggleActive(Number(id), companyId));
    },

    async setDefault(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const companyId = req.user.company_id!;
        return reply.send(await botsService.setDefault(Number(id), companyId));
    },

    async getNodes(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const companyId = req.user.company_id!;
        return reply.send(await botsService.getNodes(Number(id), companyId));
    },

    async syncNodes(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const companyId = req.user.company_id!;
        const { nodes } = req.body as { nodes: any[] };
        if (!Array.isArray(nodes)) return reply.status(400).send({ error: 'nodes deve ser um array' });
        await botsService.syncNodes(Number(id), companyId, nodes);
        return reply.send({ ok: true });
    },

    /** Upload de mídia dos nós (imagem/vídeo/áudio/figurinha/documento). */
    async uploadMedia(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;

        const file = await (req as any).file();
        if (!file) return reply.status(400).send({ error: 'Arquivo não enviado' });

        const buffer: Buffer = await file.toBuffer();
        if (buffer.length > UPLOAD_MAX_BYTES) {
            return reply.status(413).send({ error: 'Arquivo maior que 25MB' });
        }

        const original: string = file.filename ?? 'arquivo';
        const ext = path.extname(original).toLowerCase().slice(0, 10) || '';
        const dir = path.join(process.cwd(), 'uploads', 'bots', companyId);
        await fs.mkdir(dir, { recursive: true });

        const fileName = `${randomUUID()}${ext}`;
        await fs.writeFile(path.join(dir, fileName), buffer);

        return reply.status(201).send({
            url: `/uploads/bots/${companyId}/${fileName}`,
            mimetype: file.mimetype ?? 'application/octet-stream',
            originalname: original,
        });
    },

    /** Relatório do nó Rotacionar Contato: leads distribuídos por contato. */
    async rotateReport(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const { nodeId } = req.params as { id: string; nodeId: string };

        const rows = await db
            .select({
                contact_name: bot_rotate_log.contact_name,
                contact_phone: bot_rotate_log.contact_phone,
                total: sql<number>`count(*)::int`,
                last_at: max(bot_rotate_log.created_at),
            })
            .from(bot_rotate_log)
            .where(and(
                eq(bot_rotate_log.company_id, companyId),
                eq(bot_rotate_log.node_id, nodeId),
            ))
            .groupBy(bot_rotate_log.contact_name, bot_rotate_log.contact_phone)
            .orderBy(desc(sql`count(*)`));

        return reply.send(rows);
    },
};
