import { and, desc, eq, gte, inArray, isNull, max, sql } from 'drizzle-orm';
import { db as defaultDb, type DB } from '../../database/client';
import { connections, queues } from '../atendimento/atendimento.db.schema';
import {
    bots, bot_nodes, bot_conversations, bot_rotate_log,
    type Bot, type BotNode, type BotConversation, type NewBot, type NewBotNode,
} from './bots.db.schema';

export interface RotateReportRow {
    contact_name: string | null;
    contact_phone: string;
    total: number;
    last_at: Date | null;
}

/** Cadastro dos bots e dos nós do fluxo (tela de Automações). */
export interface BotRepository {
    list(companyId: string): Promise<Bot[]>;
    findById(id: number, companyId: string): Promise<Bot | null>;
    create(data: NewBot): Promise<Bot>;
    update(id: number, companyId: string, data: Partial<NewBot>): Promise<Bot>;
    softDelete(id: number, companyId: string): Promise<void>;
    /** Torna este o bot padrão e desmarca os outros, juntos. */
    makeDefault(id: number, companyId: string): Promise<Bot>;
    getNodes(botId: number, companyId: string): Promise<BotNode[]>;
    /** Troca todos os nós do bot; se algo falhar, o fluxo anterior fica intacto. */
    replaceNodes(botId: number, companyId: string, nodes: NewBotNode[]): Promise<void>;
    ownedQueueIds(companyId: string, ids: number[]): Promise<number[]>;
    ownsConnection(companyId: string, connectionId: number): Promise<boolean>;
    conversationsSince(companyId: string, since: Date): Promise<BotConversation[]>;
    countActiveConversations(companyId: string): Promise<number>;
    rotateReport(companyId: string, nodeId: string): Promise<RotateReportRow[]>;
}

/** O que o motor dos fluxos lê para responder um contato. */
export interface BotFlowReader {
    findDefaultActive(companyId: string): Promise<Bot | undefined>;
    getNodes(botId: number, companyId: string): Promise<BotNode[]>;
}

/** Conversas em andamento com o bot (onde o contato está no fluxo). */
export interface BotConversationStore {
    findActiveConversation(companyId: string, botId: number, phone: string): Promise<BotConversation | undefined>;
    createConversation(data: Omit<typeof bot_conversations.$inferInsert, 'id' | 'started_at' | 'updated_at'>): Promise<BotConversation>;
    updateConversation(id: number, data: Partial<typeof bot_conversations.$inferInsert>): Promise<void>;
}

export class DrizzleBotRepository implements BotRepository, BotFlowReader, BotConversationStore {
    constructor(private readonly db: DB) {}

    // ── Bots ────────────────────────────────────────────────────────────────

    list(companyId: string): Promise<Bot[]> {
        return this.db.select().from(bots).where(and(eq(bots.company_id, companyId), isNull(bots.deleted_at)));
    }

    async findById(id: number, companyId: string): Promise<Bot | null> {
        const [row] = await this.db.select().from(bots)
            .where(and(eq(bots.id, id), eq(bots.company_id, companyId), isNull(bots.deleted_at)));
        return row ?? null;
    }

    async findDefaultActive(companyId: string): Promise<Bot | undefined> {
        const [row] = await this.db.select().from(bots)
            .where(and(eq(bots.company_id, companyId), eq(bots.active, true), eq(bots.default_bot, true), isNull(bots.deleted_at)));
        return row;
    }

    async create(data: NewBot) {
        const [row] = await this.db.insert(bots).values(data).returning();
        return row;
    }

    async update(id: number, companyId: string, data: Partial<NewBot>) {
        const [row] = await this.db.update(bots).set(data)
            .where(and(eq(bots.id, id), eq(bots.company_id, companyId))).returning();
        return row;
    }

    async softDelete(id: number, companyId: string) {
        await this.db.update(bots).set({ deleted_at: new Date() }).where(and(eq(bots.id, id), eq(bots.company_id, companyId)));
    }

    makeDefault(id: number, companyId: string) {
        return this.db.transaction(async (tx) => {
            await tx.update(bots).set({ default_bot: false }).where(eq(bots.company_id, companyId));
            const [row] = await tx.update(bots).set({ default_bot: true })
                .where(and(eq(bots.id, id), eq(bots.company_id, companyId))).returning();
            return row;
        });
    }

    // ── Nós ─────────────────────────────────────────────────────────────────

    getNodes(botId: number, companyId: string): Promise<BotNode[]> {
        return this.db.select().from(bot_nodes).where(and(eq(bot_nodes.bot_id, botId), eq(bot_nodes.company_id, companyId)));
    }

    async replaceNodes(botId: number, companyId: string, nodes: NewBotNode[]) {
        await this.db.transaction(async (tx) => {
            await tx.delete(bot_nodes).where(and(eq(bot_nodes.bot_id, botId), eq(bot_nodes.company_id, companyId)));
            if (nodes.length) await tx.insert(bot_nodes).values(nodes);
        });
    }

    async ownedQueueIds(companyId: string, ids: number[]) {
        if (ids.length === 0) return [];
        const rows = await this.db.select({ id: queues.id }).from(queues)
            .where(and(eq(queues.company_id, companyId), inArray(queues.id, ids), isNull(queues.deleted_at)));
        return rows.map((r) => r.id);
    }

    async ownsConnection(companyId: string, connectionId: number) {
        const [row] = await this.db.select({ id: connections.id }).from(connections)
            .where(and(eq(connections.company_id, companyId), eq(connections.id, connectionId))).limit(1);
        return Boolean(row);
    }

    // ── Conversas ───────────────────────────────────────────────────────────

    async findActiveConversation(companyId: string, botId: number, phone: string): Promise<BotConversation | undefined> {
        const [row] = await this.db.select().from(bot_conversations)
            .where(and(
                eq(bot_conversations.company_id, companyId),
                eq(bot_conversations.bot_id, botId),
                eq(bot_conversations.contact_phone, phone),
                eq(bot_conversations.status, 'active'),
            ));
        return row;
    }

    async createConversation(data: Omit<typeof bot_conversations.$inferInsert, 'id' | 'started_at' | 'updated_at'>) {
        const [row] = await this.db.insert(bot_conversations).values(data).returning();
        return row;
    }

    async updateConversation(id: number, data: Partial<typeof bot_conversations.$inferInsert>) {
        await this.db.update(bot_conversations).set({ ...data, updated_at: new Date() }).where(eq(bot_conversations.id, id));
    }

    async countActiveConversations(companyId: string) {
        const [row] = await this.db.select({ count: sql<number>`cast(count(*) as int)` }).from(bot_conversations)
            .where(and(eq(bot_conversations.company_id, companyId), eq(bot_conversations.status, 'active')));
        return row?.count ?? 0;
    }

    conversationsSince(companyId: string, since: Date): Promise<BotConversation[]> {
        return this.db.select().from(bot_conversations)
            .where(and(eq(bot_conversations.company_id, companyId), gte(bot_conversations.started_at, since)))
            .orderBy(desc(bot_conversations.started_at));
    }

    // ── Rodízio ─────────────────────────────────────────────────────────────

    rotateReport(companyId: string, nodeId: string): Promise<RotateReportRow[]> {
        return this.db
            .select({
                contact_name: bot_rotate_log.contact_name,
                contact_phone: bot_rotate_log.contact_phone,
                total: sql<number>`count(*)::int`,
                last_at: max(bot_rotate_log.created_at),
            })
            .from(bot_rotate_log)
            .where(and(eq(bot_rotate_log.company_id, companyId), eq(bot_rotate_log.node_id, nodeId)))
            .groupBy(bot_rotate_log.contact_name, bot_rotate_log.contact_phone)
            .orderBy(desc(sql`count(*)`));
    }
}

/** Instância usada pelo motor dos fluxos (chatbot-executor) até a refatoração dele. */
export const botsRepository = new DrizzleBotRepository(defaultDb);
