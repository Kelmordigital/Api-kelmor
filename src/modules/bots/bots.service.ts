import { botsRepository } from './bots.repository';
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

export const botsService = {

    async list(companyId: string): Promise<Bot[]> {
        return botsRepository.findByCompany(companyId);
    },

    async getById(id: number, companyId: string): Promise<Bot> {
        const bot = await botsRepository.findById(id, companyId);
        if (!bot) {
            const err = new Error('Bot não encontrado') as any;
            err.statusCode = 404;
            throw err;
        }
        return bot;
    },

    async create(companyId: string, data: Partial<Bot> & { name: string }): Promise<Bot> {
        return botsRepository.create({
            company_id:        companyId,
            name:              data.name,
            active:            data.active            ?? false,
            default_bot:       data.default_bot       ?? false,
            response_timer:    data.response_timer    ?? 3,
            opening_hours:     data.opening_hours     ?? false,
            offline_message:   data.offline_message   ?? null,
            exit_message:      data.exit_message      ?? null,
            send_exit_message: data.send_exit_message ?? false,
            timezone:          data.timezone          ?? 'America/Sao_Paulo',
            mon_ini: data.mon_ini ?? null, mon_fin: data.mon_fin ?? null,
            tue_ini: data.tue_ini ?? null, tue_fin: data.tue_fin ?? null,
            wed_ini: data.wed_ini ?? null, wed_fin: data.wed_fin ?? null,
            thu_ini: data.thu_ini ?? null, thu_fin: data.thu_fin ?? null,
            fri_ini: data.fri_ini ?? null, fri_fin: data.fri_fin ?? null,
            sat_ini: data.sat_ini ?? null, sat_fin: data.sat_fin ?? null,
            sun_ini: data.sun_ini ?? null, sun_fin: data.sun_fin ?? null,
        });
    },

    async update(id: number, companyId: string, data: Partial<Bot>): Promise<Bot> {
        await this.getById(id, companyId);
        return botsRepository.update(id, companyId, data);
    },

    async delete(id: number, companyId: string): Promise<void> {
        await this.getById(id, companyId);
        await botsRepository.softDelete(id, companyId);
    },

    async toggleActive(id: number, companyId: string): Promise<Bot> {
        const bot = await this.getById(id, companyId);
        return botsRepository.update(id, companyId, { active: !bot.active });
    },

    async setDefault(id: number, companyId: string): Promise<Bot> {
        await this.getById(id, companyId);
        await botsRepository.clearDefault(companyId);
        return botsRepository.update(id, companyId, { default_bot: true });
    },

    async getNodes(botId: number, companyId: string) {
        await this.getById(botId, companyId);
        const nodes = await botsRepository.getNodes(botId, companyId);
        return nodes.map(n => ({
            ...n,
            node_data: n.node_data ? JSON.parse(n.node_data) : null,
        }));
    },

    async syncNodes(botId: number, companyId: string, nodes: NodeInput[]): Promise<void> {
        await this.getById(botId, companyId);
        await botsRepository.deleteNodes(botId, companyId);
        await botsRepository.insertNodes(nodes.map(n => ({
            id:           n.id,
            bot_id:       botId,
            company_id:   companyId,
            type:         n.type,
            label:        n.label,
            message:      n.message ?? '',
            order_index:  n.order_index,
            next_node_id: n.next_node_id ?? null,
            delay_seconds: n.delay_seconds ?? 2,
            x:            n.x,
            y:            n.y,
            node_data:    n.node_data ? JSON.stringify(n.node_data) : null,
            queue_id:     n.queue_id ?? null,
        })));
    },

    /**
     * Mini dashboard da tela de Automações: contagens de fluxos, execuções
     * (bot_conversations) dos últimos 7 dias por dia, e execuções recentes.
     */
    async getStats(companyId: string) {
        const bots = await botsRepository.findByCompany(companyId);

        const byTrigger: Record<string, number> = {};
        for (const b of bots) {
            const key = b.trigger_type ?? 'welcome';
            byTrigger[key] = (byTrigger[key] ?? 0) + 1;
        }

        const since = new Date();
        since.setDate(since.getDate() - 6);
        since.setHours(0, 0, 0, 0);

        const [conversations, inProgressCount] = await Promise.all([
            botsRepository.findConversationsSince(companyId, since),
            botsRepository.countActiveConversations(companyId),
        ]);

        const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        const buckets = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(since);
            d.setDate(d.getDate() + i);
            return { date: d.toISOString().split('T')[0], label: DOW[d.getDay()], count: 0 };
        });
        const byDate = new Map(buckets.map(b => [b.date, b]));

        const todayStr = new Date().toISOString().split('T')[0];
        let todayCount = 0;
        let errorCount = 0;
        for (const c of conversations) {
            const dateStr = new Date(c.started_at!).toISOString().split('T')[0];
            const bucket = byDate.get(dateStr);
            if (bucket) bucket.count++;
            if (dateStr === todayStr) todayCount++;
            if (c.status === 'error') errorCount++;
        }

        const botNameById = new Map(bots.map(b => [b.id, b.name]));
        const recentExecutions = conversations.slice(0, 8).map(c => ({
            bot_name:      botNameById.get(c.bot_id) ?? 'Fluxo removido',
            started_at:    c.started_at!.toISOString(),
            status:        c.status,
            error_message: c.error_message ?? null,
        }));

        return {
            active_bots:        bots.filter(b => b.active).length,
            total_bots:         bots.length,
            today_count:        todayCount,
            in_progress_count:  inProgressCount,
            error_count:        errorCount,
            last_7_days_count:  conversations.length,
            by_trigger:         byTrigger,
            executions_by_day:  buckets,
            recent_executions:  recentExecutions,
        };
    },
};
