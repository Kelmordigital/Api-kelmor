"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.quickMessageService = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../database/client");
const quick_messages_db_schema_1 = require("./quick-messages.db.schema");
const promises_1 = require("stream/promises");
const fs_1 = require("fs");
const promises_2 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
exports.quickMessageService = {
    async list(companyId, params = {}) {
        const page = Math.max(1, params.page ?? 1);
        const limit = Math.min(50, Math.max(1, params.limit ?? 10));
        const offset = (page - 1) * limit;
        const where = params.search
            ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(quick_messages_db_schema_1.quickMessages.company_id, companyId), (0, drizzle_orm_1.ilike)(quick_messages_db_schema_1.quickMessages.title, `%${params.search}%`))
            : (0, drizzle_orm_1.eq)(quick_messages_db_schema_1.quickMessages.company_id, companyId);
        const [rows, [{ total }]] = await Promise.all([
            client_1.db.select()
                .from(quick_messages_db_schema_1.quickMessages)
                .where(where)
                .orderBy(quick_messages_db_schema_1.quickMessages.created_at)
                .limit(limit)
                .offset(offset),
            client_1.db.select({ total: (0, drizzle_orm_1.count)() }).from(quick_messages_db_schema_1.quickMessages).where(where),
        ]);
        return {
            data: rows,
            total: Number(total),
            page,
            limit,
            totalPages: Math.ceil(Number(total) / limit),
        };
    },
    async findById(id, companyId) {
        const [row] = await client_1.db
            .select()
            .from(quick_messages_db_schema_1.quickMessages)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(quick_messages_db_schema_1.quickMessages.id, id), (0, drizzle_orm_1.eq)(quick_messages_db_schema_1.quickMessages.company_id, companyId)));
        return row;
    },
    async create(companyId, payload) {
        const [row] = await client_1.db
            .insert(quick_messages_db_schema_1.quickMessages)
            .values({ company_id: companyId, ...payload, updated_at: new Date() })
            .returning();
        return row;
    },
    async update(id, companyId, payload) {
        const { remove_media, ...rest } = payload;
        const updateData = { ...rest, updated_at: new Date() };
        if (remove_media) {
            updateData.media_path = null;
            updateData.media_type = null;
            updateData.media_size = null;
        }
        const [row] = await client_1.db
            .update(quick_messages_db_schema_1.quickMessages)
            .set(updateData)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(quick_messages_db_schema_1.quickMessages.id, id), (0, drizzle_orm_1.eq)(quick_messages_db_schema_1.quickMessages.company_id, companyId)))
            .returning();
        return row ?? null;
    },
    async remove(id, companyId) {
        const [deleted] = await client_1.db
            .delete(quick_messages_db_schema_1.quickMessages)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(quick_messages_db_schema_1.quickMessages.id, id), (0, drizzle_orm_1.eq)(quick_messages_db_schema_1.quickMessages.company_id, companyId)))
            .returning();
        return deleted ?? null;
    },
    async saveFile(companyId, originalName, stream) {
        const ext = path_1.default.extname(originalName).toLowerCase();
        const fileName = `${Date.now()}-${crypto_1.default.randomUUID()}${ext}`;
        const dir = path_1.default.join(process.cwd(), 'uploads', 'quick-messages', companyId);
        await promises_2.default.mkdir(dir, { recursive: true });
        const fullPath = path_1.default.join(dir, fileName);
        const relativePath = `uploads/quick-messages/${companyId}/${fileName}`;
        let size = 0;
        stream.on('data', (chunk) => { size += chunk.length; });
        await (0, promises_1.pipeline)(stream, (0, fs_1.createWriteStream)(fullPath));
        return { filePath: relativePath, size };
    },
    async deleteFile(mediaPath) {
        const fullPath = path_1.default.join(process.cwd(), mediaPath);
        await promises_2.default.unlink(fullPath).catch(() => { });
    },
};
//# sourceMappingURL=quick-messages.service.js.map