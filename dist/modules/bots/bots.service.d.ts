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
    queue_id?: number | null;
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
        y: number;
        id: string;
        created_at: Date | null;
        company_id: string;
        queue_id: number | null;
        bot_id: number;
        label: string;
        order_index: number;
        next_node_id: string | null;
        delay_seconds: number;
        x: number;
    }[]>;
    syncNodes(botId: number, companyId: string, nodes: NodeInput[]): Promise<void>;
    /**
     * Mini dashboard da tela de Automações: contagens de fluxos, execuções
     * (bot_conversations) dos últimos 7 dias por dia, e execuções recentes.
     */
    getStats(companyId: string): Promise<{
        active_bots: number;
        total_bots: number;
        today_count: number;
        in_progress_count: number;
        error_count: number;
        last_7_days_count: number;
        by_trigger: Record<string, number>;
        executions_by_day: {
            date: string;
            label: string;
            count: number;
        }[];
        recent_executions: {
            bot_name: string;
            started_at: string;
            status: string;
            error_message: string | null;
        }[];
    }>;
};
export {};
//# sourceMappingURL=bots.service.d.ts.map