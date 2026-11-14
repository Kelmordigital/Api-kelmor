import { BadRequestError, NotFoundError } from '../../core/errors/http-errors';
import { isUniqueViolation } from '../../core/database/pg-errors';
import type { Bot, BotConversation } from './bots.db.schema';
import type { BotRepository } from './bots.repository';
import type { CreateBotInput, NodeInput, UpdateBotInput } from './bots.dto';
import { brCalendar, brMidnight, todayBR } from '../../core/dates/br-day';

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DUPLICATE_NODES = 'Há nós com o mesmo id no fluxo';

/** Mini painel da tela de Automações (RN-BOT-07). */
export class BotStats {
    /** Primeiro dia da janela de 7 dias (hoje e os 6 anteriores), à meia-noite de Brasília. */
    static windowStart(now: Date): Date {
        const { year, month, day } = brCalendar(now);
        return brMidnight(year, month, day - 6);
    }

    static build(bots: Bot[], conversations: BotConversation[], inProgress: number, now: Date) {
        const byTrigger: Record<string, number> = {};
        for (const b of bots) byTrigger[b.trigger_type ?? 'welcome'] = (byTrigger[b.trigger_type ?? 'welcome'] ?? 0) + 1;

        const since = BotStats.windowStart(now);
        const buckets = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000); // meia-noite de Brasília de cada dia
            return { date: BotStats.day(d), label: WEEKDAY_LABELS[brCalendar(d).weekday], count: 0 };
        });
        const byDate = new Map(buckets.map((b) => [b.date, b]));

        const today = BotStats.day(now);
        let todayCount = 0;
        let errorCount = 0;
        for (const c of conversations) {
            const day = BotStats.day(new Date(c.started_at!));
            const bucket = byDate.get(day);
            if (bucket) bucket.count++;
            if (day === today) todayCount++;
            if (c.status === 'error') errorCount++;
        }

        const nameById = new Map(bots.map((b) => [b.id, b.name]));
        return {
            active_bots: bots.filter((b) => b.active).length,
            total_bots: bots.length,
            today_count: todayCount,
            in_progress_count: inProgress,
            error_count: errorCount,
            last_7_days_count: conversations.length,
            by_trigger: byTrigger,
            executions_by_day: buckets,
            recent_executions: conversations.slice(0, 8).map((c) => ({
                bot_name: nameById.get(c.bot_id) ?? 'Fluxo removido',
                started_at: c.started_at!.toISOString(),
                status: c.status,
                error_message: c.error_message ?? null,
            })),
        };
    }

    /** Dia (AAAA-MM-DD) do instante no calendário de Brasília. */
    private static day(d: Date): string {
        return todayBR(d);
    }
}

/** Fluxos de atendimento automático (bots) da empresa. */
export class BotService {
    constructor(
        private readonly repository: BotRepository,
        private readonly now: () => Date = () => new Date(),
    ) {}

    list(companyId: string) {
        return this.repository.list(companyId);
    }

    async get(id: number, companyId: string): Promise<Bot> {
        const bot = await this.repository.findById(id, companyId);
        if (!bot) throw new NotFoundError('Bot não encontrado');
        return bot;
    }

    async create(companyId: string, input: CreateBotInput) {
        await this.assertConnection(companyId, input.connection_id);
        return this.repository.create({ ...input, company_id: companyId });
    }

    async update(id: number, companyId: string, input: UpdateBotInput) {
        await this.get(id, companyId);
        await this.assertConnection(companyId, input.connection_id);
        if (Object.keys(input).length === 0) return this.get(id, companyId);
        return this.repository.update(id, companyId, input);
    }

    async remove(id: number, companyId: string) {
        await this.get(id, companyId);
        await this.repository.softDelete(id, companyId);
    }

    async toggleActive(id: number, companyId: string) {
        const bot = await this.get(id, companyId);
        return this.repository.update(id, companyId, { active: !bot.active });
    }

    /** RN-BOT-03: só um bot padrão por empresa. */
    async setDefault(id: number, companyId: string) {
        await this.get(id, companyId);
        return this.repository.makeDefault(id, companyId);
    }

    async getNodes(botId: number, companyId: string) {
        await this.get(botId, companyId);
        const nodes = await this.repository.getNodes(botId, companyId);
        return nodes.map((n) => ({ ...n, node_data: BotService.parseData(n.node_data) }));
    }

    /** RN-BOT-04: salva o fluxo inteiro de uma vez — ou tudo, ou nada. */
    async syncNodes(botId: number, companyId: string, nodes: NodeInput[]) {
        await this.get(botId, companyId);
        if (new Set(nodes.map((n) => n.id)).size !== nodes.length) throw new BadRequestError(DUPLICATE_NODES);
        await this.assertQueues(companyId, nodes);

        try {
            await this.repository.replaceNodes(botId, companyId, nodes.map((n) => ({
                id: n.id, bot_id: botId, company_id: companyId, type: n.type, label: n.label,
                message: n.message ?? '', order_index: n.order_index, next_node_id: n.next_node_id ?? null,
                delay_seconds: n.delay_seconds, x: n.x, y: n.y,
                node_data: n.node_data ? JSON.stringify(n.node_data) : null,
                queue_id: n.queue_id ?? null,
            })));
        } catch (err) {
            // id de nó já usado por outro fluxo (a chave é global)
            if (isUniqueViolation(err)) throw new BadRequestError(DUPLICATE_NODES);
            throw err;
        }
    }

    async stats(companyId: string) {
        const now = this.now();
        const [bots, conversations, inProgress] = await Promise.all([
            this.repository.list(companyId),
            this.repository.conversationsSince(companyId, BotStats.windowStart(now)),
            this.repository.countActiveConversations(companyId),
        ]);
        return BotStats.build(bots, conversations, inProgress, now);
    }

    async rotateReport(botId: number, companyId: string, nodeId: string) {
        await this.get(botId, companyId);
        return this.repository.rotateReport(companyId, nodeId);
    }

    private async assertConnection(companyId: string, connectionId: number | null | undefined) {
        if (connectionId == null) return;
        if (!(await this.repository.ownsConnection(companyId, connectionId))) throw new BadRequestError('Conexão não encontrada');
    }

    /** RN-BOT-05: o nó "Transferir" só aponta para fila da própria empresa. */
    private async assertQueues(companyId: string, nodes: NodeInput[]) {
        const withQueue = nodes.filter((n) => n.queue_id != null);
        const owned = new Set(await this.repository.ownedQueueIds(companyId, [...new Set(withQueue.map((n) => n.queue_id!))]));
        const foreign = withQueue.find((n) => !owned.has(n.queue_id!));
        if (foreign) throw new BadRequestError(`Fila do nó "${foreign.label}" não encontrada`);
    }

    private static parseData(raw: string | null): unknown {
        if (!raw) return null;
        try { return JSON.parse(raw); } catch { return null; }
    }
}
