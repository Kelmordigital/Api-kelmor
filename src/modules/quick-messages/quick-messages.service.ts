import { eq, and, ilike, count } from 'drizzle-orm';
import { db } from '../../database/client';
import { quickMessages, QuickMessage, NewQuickMessage } from './quick-messages.db.schema';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { Readable } from 'stream';

interface ListParams {
    page?: number;
    limit?: number;
    search?: string;
}

interface CreatePayload {
    title: string;
    message?: string | null;
    media_path?: string | null;
    media_type?: string | null;
    media_size?: number | null;
}

interface UpdatePayload {
    title?: string;
    message?: string | null;
    media_path?: string | null;
    media_type?: string | null;
    media_size?: number | null;
    remove_media?: boolean;
}

export const quickMessageService = {

    async list(companyId: string, params: ListParams = {}) {
        const page  = Math.max(1, params.page  ?? 1);
        const limit = Math.min(50, Math.max(1, params.limit ?? 10));
        const offset = (page - 1) * limit;

        const where = params.search
            ? and(eq(quickMessages.company_id, companyId), ilike(quickMessages.title, `%${params.search}%`))
            : eq(quickMessages.company_id, companyId);

        const [rows, [{ total }]] = await Promise.all([
            db.select()
              .from(quickMessages)
              .where(where)
              .orderBy(quickMessages.created_at)
              .limit(limit)
              .offset(offset),
            db.select({ total: count() }).from(quickMessages).where(where),
        ]);

        return {
            data: rows,
            total: Number(total),
            page,
            limit,
            totalPages: Math.ceil(Number(total) / limit),
        };
    },

    async findById(id: number, companyId: string): Promise<QuickMessage | undefined> {
        const [row] = await db
            .select()
            .from(quickMessages)
            .where(and(eq(quickMessages.id, id), eq(quickMessages.company_id, companyId)));
        return row;
    },

    async create(companyId: string, payload: CreatePayload): Promise<QuickMessage> {
        const [row] = await db
            .insert(quickMessages)
            .values({ company_id: companyId, ...payload, updated_at: new Date() })
            .returning();
        return row;
    },

    async update(id: number, companyId: string, payload: UpdatePayload): Promise<QuickMessage | null> {
        const { remove_media, ...rest } = payload;
        const updateData: Partial<NewQuickMessage> = { ...rest, updated_at: new Date() };

        if (remove_media) {
            updateData.media_path = null;
            updateData.media_type = null;
            updateData.media_size = null;
        }

        const [row] = await db
            .update(quickMessages)
            .set(updateData)
            .where(and(eq(quickMessages.id, id), eq(quickMessages.company_id, companyId)))
            .returning();
        return row ?? null;
    },

    async remove(id: number, companyId: string): Promise<QuickMessage | null> {
        const [deleted] = await db
            .delete(quickMessages)
            .where(and(eq(quickMessages.id, id), eq(quickMessages.company_id, companyId)))
            .returning();
        return deleted ?? null;
    },

    async saveFile(
        companyId: string,
        originalName: string,
        stream: Readable,
    ): Promise<{ filePath: string; size: number }> {
        const ext      = path.extname(originalName).toLowerCase();
        const fileName = `${Date.now()}-${crypto.randomUUID()}${ext}`;
        const dir      = path.join(process.cwd(), 'uploads', 'quick-messages', companyId);

        await fs.mkdir(dir, { recursive: true });

        const fullPath     = path.join(dir, fileName);
        const relativePath = `uploads/quick-messages/${companyId}/${fileName}`;

        let size = 0;
        stream.on('data', (chunk: Buffer) => { size += chunk.length; });
        await pipeline(stream, createWriteStream(fullPath));

        return { filePath: relativePath, size };
    },

    async deleteFile(mediaPath: string): Promise<void> {
        const fullPath = path.join(process.cwd(), mediaPath);
        await fs.unlink(fullPath).catch(() => {});
    },
};
