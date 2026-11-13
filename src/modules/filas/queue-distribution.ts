import type { Queue } from '../atendimento/atendimento.db.schema';
import type { DistributionMode } from './fila.dto';
import type { DistributionStats } from './fila.repository';

/** Sorteio entre empatados; injetável para os testes serem determinísticos. */
export type Picker = <T>(options: T[]) => T;
export const randomPick: Picker = (options) => options[Math.floor(Math.random() * options.length)];

/** Escolhe um atendente entre os elegíveis (sempre 2 ou mais) de uma fila. */
export interface DistributionStrategy {
    choose(queueId: number, eligible: string[]): Promise<string>;
}

/** Menor contagem de tickets num status vence; empate → sorteio. */
class FewestTickets implements DistributionStrategy {
    constructor(private readonly stats: DistributionStats, private readonly statusId: number, private readonly pick: Picker) {}

    async choose(queueId: number, eligible: string[]): Promise<string> {
        const counts = await this.stats.ticketCounts(queueId, this.statusId, eligible);
        const min = Math.min(...eligible.map((id) => counts.get(id) ?? 0));
        return this.pick(eligible.filter((id) => (counts.get(id) ?? 0) === min));
    }
}

/** Mais ocioso: quem nunca pegou ticket da fila; senão, a atividade mais antiga. */
class MostIdle implements DistributionStrategy {
    constructor(private readonly stats: DistributionStats, private readonly pick: Picker) {}

    async choose(queueId: number, eligible: string[]): Promise<string> {
        const last = await this.stats.lastActivity(queueId, eligible);
        const neverServed = eligible.filter((id) => !last.has(id));
        if (neverServed.length) return this.pick(neverServed);
        const oldest = Math.min(...eligible.map((id) => last.get(id)!));
        return this.pick(eligible.filter((id) => last.get(id) === oldest));
    }
}

/** RN-FIL-07: os modos de distribuição automática. */
export function distributionStrategies(stats: DistributionStats, pick: Picker = randomPick): Record<Exclude<DistributionMode, 'none'>, DistributionStrategy> {
    return {
        less_attendances: new FewestTickets(stats, 2, pick), // menor carga atual (em atendimento)
        time:             new FewestTickets(stats, 3, pick), // quem menos atendeu (finalizados)
        attendant:        new MostIdle(stats, pick),
    };
}

/** Quem pode receber ticket agora: da fila, com a conexão, online e com vaga. */
export interface EligibilityFilter {
    candidates(companyId: string, queueId: number, connectionId: number): Promise<string[]>;
}

/**
 * Atribui um ticket novo da fila a um atendente, conforme o modo da fila.
 * undefined = sem distribuição ou ninguém elegível (o ticket fica pendente).
 */
export class QueueDistributor {
    constructor(
        private readonly findQueue: (queueId: number, companyId: string) => Promise<Queue | null>,
        private readonly eligibility: EligibilityFilter,
        private readonly strategies: Partial<Record<DistributionMode, DistributionStrategy>>,
    ) {}

    async distribute(companyId: string, queueId: number, connectionId: number | null | undefined): Promise<string | undefined> {
        const queue = await this.findQueue(queueId, companyId);
        if (!queue || queue.enabled === false || connectionId == null) return undefined;
        const strategy = this.strategies[queue.distribution as DistributionMode];
        if (!strategy) return undefined;

        const eligible = await this.eligibility.candidates(companyId, queueId, connectionId);
        if (eligible.length <= 1) return eligible[0];
        return strategy.choose(queueId, eligible);
    }
}
