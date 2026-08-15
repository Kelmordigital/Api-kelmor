"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.botsController = void 0;
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const crypto_1 = require("crypto");
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../database/client");
const bots_db_schema_1 = require("./bots.db.schema");
const bots_service_1 = require("./bots.service");
const UPLOAD_MAX_BYTES = 25 * 1024 * 1024; // 25MB
exports.botsController = {
    async list(req, reply) {
        const companyId = req.user.company_id;
        return reply.send(await bots_service_1.botsService.list(companyId));
    },
    async stats(req, reply) {
        const companyId = req.user.company_id;
        return reply.send(await bots_service_1.botsService.getStats(companyId));
    },
    async create(req, reply) {
        const companyId = req.user.company_id;
        const body = req.body;
        if (!body?.name?.trim())
            return reply.status(400).send({ error: 'name é obrigatório' });
        const bot = await bots_service_1.botsService.create(companyId, body);
        return reply.status(201).send(bot);
    },
    async update(req, reply) {
        const { id } = req.params;
        const companyId = req.user.company_id;
        return reply.send(await bots_service_1.botsService.update(Number(id), companyId, req.body));
    },
    async remove(req, reply) {
        const { id } = req.params;
        const companyId = req.user.company_id;
        await bots_service_1.botsService.delete(Number(id), companyId);
        return reply.send({ ok: true });
    },
    async toggleActive(req, reply) {
        const { id } = req.params;
        const companyId = req.user.company_id;
        return reply.send(await bots_service_1.botsService.toggleActive(Number(id), companyId));
    },
    async setDefault(req, reply) {
        const { id } = req.params;
        const companyId = req.user.company_id;
        return reply.send(await bots_service_1.botsService.setDefault(Number(id), companyId));
    },
    async getNodes(req, reply) {
        const { id } = req.params;
        const companyId = req.user.company_id;
        return reply.send(await bots_service_1.botsService.getNodes(Number(id), companyId));
    },
    async syncNodes(req, reply) {
        const { id } = req.params;
        const companyId = req.user.company_id;
        const { nodes } = req.body;
        if (!Array.isArray(nodes))
            return reply.status(400).send({ error: 'nodes deve ser um array' });
        await bots_service_1.botsService.syncNodes(Number(id), companyId, nodes);
        return reply.send({ ok: true });
    },
    /** Upload de mídia dos nós (imagem/vídeo/áudio/figurinha/documento). */
    async uploadMedia(req, reply) {
        const companyId = req.user.company_id;
        const file = await req.file();
        if (!file)
            return reply.status(400).send({ error: 'Arquivo não enviado' });
        const buffer = await file.toBuffer();
        if (buffer.length > UPLOAD_MAX_BYTES) {
            return reply.status(413).send({ error: 'Arquivo maior que 25MB' });
        }
        const original = file.filename ?? 'arquivo';
        const ext = path_1.default.extname(original).toLowerCase().slice(0, 10) || '';
        const dir = path_1.default.join(process.cwd(), 'uploads', 'bots', companyId);
        await promises_1.default.mkdir(dir, { recursive: true });
        const fileName = `${(0, crypto_1.randomUUID)()}${ext}`;
        await promises_1.default.writeFile(path_1.default.join(dir, fileName), buffer);
        return reply.status(201).send({
            url: `/uploads/bots/${companyId}/${fileName}`,
            mimetype: file.mimetype ?? 'application/octet-stream',
            originalname: original,
        });
    },
    /** Relatório do nó Rotacionar Contato: leads distribuídos por contato. */
    async rotateReport(req, reply) {
        const companyId = req.user.company_id;
        const { nodeId } = req.params;
        const rows = await client_1.db
            .select({
            contact_name: bots_db_schema_1.bot_rotate_log.contact_name,
            contact_phone: bots_db_schema_1.bot_rotate_log.contact_phone,
            total: (0, drizzle_orm_1.sql) `count(*)::int`,
            last_at: (0, drizzle_orm_1.max)(bots_db_schema_1.bot_rotate_log.created_at),
        })
            .from(bots_db_schema_1.bot_rotate_log)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(bots_db_schema_1.bot_rotate_log.company_id, companyId), (0, drizzle_orm_1.eq)(bots_db_schema_1.bot_rotate_log.node_id, nodeId)))
            .groupBy(bots_db_schema_1.bot_rotate_log.contact_name, bots_db_schema_1.bot_rotate_log.contact_phone)
            .orderBy((0, drizzle_orm_1.desc)((0, drizzle_orm_1.sql) `count(*)`));
        return reply.send(rows);
    },
};
//# sourceMappingURL=bots.controller.js.map