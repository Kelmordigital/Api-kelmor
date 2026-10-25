import { eq, and, ilike, count } from 'drizzle-orm';
import type { DB } from '../../database/client';
import { containsPattern } from '../../core/database/like-pattern';
import { quickMessages, QuickMessage, NewQuickMessage } from './quick-messages.db.schema';

export type QuickMessageData  = Omit<NewQuickMessage, 'id' | 'company_id' | 'created_at' | 'updated_at'>;
export type QuickMessagePatch = Partial<QuickMessageData>;

export interface QuickMessageQuery {
    search?: string;
    limit: number;
    offset: number;
}

/** Persistência de mensagens rápidas, sempre escopada pela empresa. */
export interface QuickMessageRepository {
    page(companyId: string, query: QuickMessageQuery): Promise<{ rows: QuickMessage[]; total: number }>;
    findById(id: number, companyId: string): Promise<QuickMessage | null>;
    create(companyId: string, data: QuickMessageData): Promise<QuickMessage>;
    update(id: number, companyId: string, patch: QuickMessagePatch): Promise<QuickMessage | null>;
    delete(id: number, companyId: string): Promise<boolean>;
}

export class DrizzleQuickMessageRepository implements QuickMessageRepository {
    constructor(private readonly db: DB) {}

    async page(companyId: string, { search, limit, offset }: QuickMessageQuery) {
        const where = search
            ? and(eq(quickMessages.company_id, companyId), ilike(quickMessages.title, containsPattern(search)))
            : eq(quickMessages.company_id, companyId);

        const [rows, [{ total }]] = await Promise.all([
            this.db.select()
                .from(quickMessages)
                .where(where)
                .orderBy(quickMessages.created_at)
                .limit(limit)
                .offset(offset),
            this.db.select({ total: count() }).from(quickMessages).where(where),
        ]);
        return { rows, total: Number(total) };
    }

    async findById(id: number, companyId: string): Promise<QuickMessage | null> {
        const [row] = await this.db
            .select()
            .from(quickMessages)
            .where(this.byIdInCompany(id, companyId));
        return row ?? null;
    }

    async create(companyId: string, data: QuickMessageData): Promise<QuickMessage> {
        const [row] = await this.db
            .insert(quickMessages)
            .values({ ...data, company_id: companyId, updated_at: new Date() })
            .returning();
        return row;
    }

    async update(id: number, companyId: string, patch: QuickMessagePatch): Promise<QuickMessage | null> {
        const [row] = await this.db
            .update(quickMessages)
            .set({ ...patch, updated_at: new Date() })
            .where(this.byIdInCompany(id, companyId))
            .returning();
        return row ?? null;
    }

    async delete(id: number, companyId: string): Promise<boolean> {
        const [row] = await this.db
            .delete(quickMessages)
            .where(this.byIdInCompany(id, companyId))
            .returning({ id: quickMessages.id });
        return !!row;
    }

    private byIdInCompany(id: number, companyId: string) {
        return and(eq(quickMessages.id, id), eq(quickMessages.company_id, companyId));
    }
}
