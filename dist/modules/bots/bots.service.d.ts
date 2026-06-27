import type { Bot } from './bots.db.schema';
interface NodeInput {
    id: string;
    type: string;
    label: string;
    message?: string;
    order_index: number;
    next_node_id?: string | null;
    delay_seconds?: number;
    x: number;
    y: number;
    node_data?: Record<string, unknown> | null;
}
export declare const botsService: {
    list(companyId: string): Promise<Bot[]>;
    getById(id: number, companyId: string): Promise<Bot>;
    create(companyId: string, data: Partial<Bot> & {
        name: string;
    }): Promise<Bot>;
    update(id: number, companyId: string, data: Partial<Bot>): Promise<Bot>;
    delete(id: number, companyId: string): Promise<void>;
    toggleActive(id: number, companyId: string): Promise<Bot>;
    setDefault(id: number, companyId: string): Promise<Bot>;
    getNodes(botId: number, companyId: string): Promise<{
        node_data: any;
        type: string;
        message: string | null;
        id: string;
        created_at: Date | null;
        company_id: string;
        bot_id: number;
        label: string;
        order_index: number;
        next_node_id: string | null;
        delay_seconds: number;
        x: number;
        y: number;
    }[]>;
    syncNodes(botId: number, companyId: string, nodes: NodeInput[]): Promise<void>;
};
export {};
//# sourceMappingURL=bots.service.d.ts.map