import { bots, bot_conversations, type Bot, type BotNode, type BotConversation, type NewBotNode } from './bots.db.schema';
export declare const botsRepository: {
    findByCompany(companyId: string): Promise<Bot[]>;
    findById(id: number, companyId: string): Promise<Bot | undefined>;
    findDefaultActive(companyId: string): Promise<Bot | undefined>;
    create(data: Omit<typeof bots.$inferInsert, "id" | "created_at">): Promise<Bot>;
    update(id: number, companyId: string, data: Partial<typeof bots.$inferInsert>): Promise<Bot>;
    softDelete(id: number, companyId: string): Promise<void>;
    clearDefault(companyId: string): Promise<void>;
    getNodes(botId: number, companyId: string): Promise<BotNode[]>;
    deleteNodes(botId: number, companyId: string): Promise<void>;
    insertNodes(nodes: NewBotNode[]): Promise<void>;
    findActiveConversation(companyId: string, botId: number, phone: string): Promise<BotConversation | undefined>;
    createConversation(data: Omit<typeof bot_conversations.$inferInsert, "id" | "started_at" | "updated_at">): Promise<BotConversation>;
    updateConversation(id: number, data: Partial<typeof bot_conversations.$inferInsert>): Promise<void>;
};
//# sourceMappingURL=bots.repository.d.ts.map