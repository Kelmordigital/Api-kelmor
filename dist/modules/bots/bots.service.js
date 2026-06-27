"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.botsService = void 0;
const bots_repository_1 = require("./bots.repository");
exports.botsService = {
    async list(companyId) {
        return bots_repository_1.botsRepository.findByCompany(companyId);
    },
    async getById(id, companyId) {
        const bot = await bots_repository_1.botsRepository.findById(id, companyId);
        if (!bot) {
            const err = new Error('Bot não encontrado');
            err.statusCode = 404;
            throw err;
        }
        return bot;
    },
    async create(companyId, data) {
        return bots_repository_1.botsRepository.create({
            company_id: companyId,
            name: data.name,
            active: data.active ?? false,
            default_bot: data.default_bot ?? false,
            response_timer: data.response_timer ?? 3,
            opening_hours: data.opening_hours ?? false,
            offline_message: data.offline_message ?? null,
            exit_message: data.exit_message ?? null,
            send_exit_message: data.send_exit_message ?? false,
            timezone: data.timezone ?? 'America/Sao_Paulo',
            mon_ini: data.mon_ini ?? null, mon_fin: data.mon_fin ?? null,
            tue_ini: data.tue_ini ?? null, tue_fin: data.tue_fin ?? null,
            wed_ini: data.wed_ini ?? null, wed_fin: data.wed_fin ?? null,
            thu_ini: data.thu_ini ?? null, thu_fin: data.thu_fin ?? null,
            fri_ini: data.fri_ini ?? null, fri_fin: data.fri_fin ?? null,
            sat_ini: data.sat_ini ?? null, sat_fin: data.sat_fin ?? null,
            sun_ini: data.sun_ini ?? null, sun_fin: data.sun_fin ?? null,
        });
    },
    async update(id, companyId, data) {
        await this.getById(id, companyId);
        return bots_repository_1.botsRepository.update(id, companyId, data);
    },
    async delete(id, companyId) {
        await this.getById(id, companyId);
        await bots_repository_1.botsRepository.softDelete(id, companyId);
    },
    async toggleActive(id, companyId) {
        const bot = await this.getById(id, companyId);
        return bots_repository_1.botsRepository.update(id, companyId, { active: !bot.active });
    },
    async setDefault(id, companyId) {
        await this.getById(id, companyId);
        await bots_repository_1.botsRepository.clearDefault(companyId);
        return bots_repository_1.botsRepository.update(id, companyId, { default_bot: true });
    },
    async getNodes(botId, companyId) {
        await this.getById(botId, companyId);
        const nodes = await bots_repository_1.botsRepository.getNodes(botId, companyId);
        return nodes.map(n => ({
            ...n,
            node_data: n.node_data ? JSON.parse(n.node_data) : null,
        }));
    },
    async syncNodes(botId, companyId, nodes) {
        await this.getById(botId, companyId);
        await bots_repository_1.botsRepository.deleteNodes(botId, companyId);
        await bots_repository_1.botsRepository.insertNodes(nodes.map(n => ({
            id: n.id,
            bot_id: botId,
            company_id: companyId,
            type: n.type,
            label: n.label,
            message: n.message ?? '',
            order_index: n.order_index,
            next_node_id: n.next_node_id ?? null,
            delay_seconds: n.delay_seconds ?? 2,
            x: n.x,
            y: n.y,
            node_data: n.node_data ? JSON.stringify(n.node_data) : null,
        })));
    },
};
//# sourceMappingURL=bots.service.js.map