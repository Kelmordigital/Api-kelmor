import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../database/client';
import {
    bots, bot_nodes, bot_conversations,
    type Bot, type BotNode, type BotConversation, type NewBotNode,
} from './bots.db.schema';

export const botsRepository = {

    // ── Bots ────────────────────────────────────────────────────────────────

    async findByCompany(companyId: string): Promise<Bot[]> {
        return db.select().from(bots)
            .where(and(eq(bots.company_id, companyId), isNull(bots.deleted_at)));
    },

    async findById(id: number, companyId: string): Promise<Bot | undefined> {
        const [row] = await db.select().from(bots)
            .where(and(eq(bots.id, id), eq(bots.company_id, companyId), isNull(bots.deleted_at)));
        return row;
    },

    async findDefaultActive(companyId: string): Promise<Bot | undefined> {
        const [row] = await db.select().from(bots)
            .where(and(
                eq(bots.company_id, companyId),
                eq(bots.active, true),
                eq(bots.default_bot, true),
                isNull(bots.deleted_at),
            ));
        return row;
    },

    async create(data: Omit<typeof bots.$inferInsert, 'id' | 'created_at'>): Promise<Bot> {
        const [row] = await db.insert(bots).values(data).returning();
        return row;
    },

    async update(id: number, companyId: string, data: Partial<typeof bots.$inferInsert>): Promise<Bot> {
        const [row] = await db.update(bots)
            .set(data)
            .where(and(eq(bots.id, id), eq(bots.company_id, companyId)))
            .returning();
        return row;
    },

    async softDelete(id: number, companyId: string): Promise<void> {
        await db.update(bots)
            .set({ deleted_at: new Date() })
            .where(and(eq(bots.id, id), eq(bots.company_id, companyId)));
    },

    async clearDefault(companyId: string): Promise<void> {
        await db.update(bots)
            .set({ default_bot: false })
            .where(eq(bots.company_id, companyId));
    },

    // ── Nodes ────────────────────────────────────────────────────────────────

    async getNodes(botId: number, companyId: string): Promise<BotNode[]> {
        return db.select().from(bot_nodes)
            .where(and(eq(bot_nodes.bot_id, botId), eq(bot_nodes.company_id, companyId)));
    },

    async deleteNodes(botId: number, companyId: string): Promise<void> {
        await db.delete(bot_nodes)
            .where(and(eq(bot_nodes.bot_id, botId), eq(bot_nodes.company_id, companyId)));
    },

    async insertNodes(nodes: NewBotNode[]): Promise<void> {
        if (nodes.length === 0) return;
        await db.insert(bot_nodes).values(nodes);
    },

    // ── Conversations ────────────────────────────────────────────────────────

    async findActiveConversation(
        companyId: string, botId: number, phone: string,
    ): Promise<BotConversation | undefined> {
        const [row] = await db.select().from(bot_conversations)
            .where(and(
                eq(bot_conversations.company_id, companyId),
                eq(bot_conversations.bot_id, botId),
                eq(bot_conversations.contact_phone, phone),
                eq(bot_conversations.status, 'active'),
            ));
        return row;
    },

    async createConversation(
        data: Omit<typeof bot_conversations.$inferInsert, 'id' | 'started_at' | 'updated_at'>,
    ): Promise<BotConversation> {
        const [row] = await db.insert(bot_conversations).values(data).returning();
        return row;
    },

    async updateConversation(
        id: number, data: Partial<typeof bot_conversations.$inferInsert>,
    ): Promise<void> {
        await db.update(bot_conversations)
            .set({ ...data, updated_at: new Date() })
            .where(eq(bot_conversations.id, id));
    },
};
