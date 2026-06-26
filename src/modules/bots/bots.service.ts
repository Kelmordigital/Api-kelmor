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
        })));
    },
};
