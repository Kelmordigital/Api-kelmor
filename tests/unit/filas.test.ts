import { describe, it, expect, vi } from 'vitest';
import { QueueDistributor, distributionStrategies, type Picker } from '../../src/modules/filas/queue-distribution';
import { FilaService, FilaVinculadaChatbotError, QueueEligibility } from '../../src/modules/filas/fila.service';
import type { DistributionStats, QueueRepository } from '../../src/modules/filas/fila.repository';
import type { Queue } from '../../src/modules/atendimento/atendimento.db.schema';
import type { CompanyPermission } from '../../src/modules/configuracao-geral/configuracao-geral.db.schema';
import { NotFoundError } from '../../src/core/errors/http-errors';

/** Sorteio determinístico: sempre o primeiro, para ver quem estava empatado. */
const first: Picker = (options) => options[0];

function stats(counts: Record<string, number> = {}, last: Record<string, number> = {}): DistributionStats {
    return {
        ticketCounts: vi.fn(async () => new Map(Object.entries(counts))),
        lastActivity: vi.fn(async () => new Map(Object.entries(last))),
    };
}

describe('Estratégias de distribuição (RN-FIL-07)', () => {
    it('menor carga: quem tem menos tickets em atendimento; sem ticket conta como zero', async () => {
        const s = stats({ ana: 3, bia: 1 });
        expect(await distributionStrategies(s, first).less_attendances.choose(1, ['ana', 'bia', 'caio'])).toBe('caio');
        expect(s.ticketCounts).toHaveBeenCalledWith(1, 2, ['ana', 'bia', 'caio']);
    });

    it('quem menos atendeu: conta finalizados (status 3); empate vai para o sorteio', async () => {
        const s = stats({ ana: 2, bia: 2, caio: 5 });
        const pick = vi.fn(first);
        expect(await distributionStrategies(s, pick).time.choose(1, ['ana', 'bia', 'caio'])).toBe('ana');
        expect(s.ticketCounts).toHaveBeenCalledWith(1, 3, expect.any(Array));
        expect(pick).toHaveBeenCalledWith(['ana', 'bia']);
    });

    it('mais ocioso: quem nunca pegou ticket da fila; senão a atividade mais antiga', async () => {
        expect(await distributionStrategies(stats({}, { ana: 100 }), first).attendant.choose(1, ['ana', 'bia'])).toBe('bia');
        expect(await distributionStrategies(stats({}, { ana: 300, bia: 100 }), first).attendant.choose(1, ['ana', 'bia'])).toBe('bia');
    });
});

describe('QueueDistributor', () => {
    const queue = (over: Partial<Queue> = {}) => ({ id: 1, enabled: true, distribution: 'less_attendances', ...over }) as Queue;
    const make = (q: Queue | null, eligible: string[]) => {
        const strategy = { choose: vi.fn(async (_q: number, ids: string[]) => ids[ids.length - 1]) };
        const distributor = new QueueDistributor(async () => q, { candidates: async () => eligible }, { less_attendances: strategy });
        return { distributor, strategy };
    };

    it('fila inexistente, desativada, sem distribuição ou ticket sem conexão → ninguém', async () => {
        expect(await make(null, ['a']).distributor.distribute('c', 1, 5)).toBeUndefined();
        expect(await make(queue({ enabled: false }), ['a']).distributor.distribute('c', 1, 5)).toBeUndefined();
        expect(await make(queue({ distribution: 'none' }), ['a']).distributor.distribute('c', 1, 5)).toBeUndefined();
        expect(await make(queue(), ['a']).distributor.distribute('c', 1, null)).toBeUndefined();
    });

    it('nenhum elegível → ninguém; um só → ele, sem consultar a estratégia; vários → a estratégia decide', async () => {
        expect(await make(queue(), []).distributor.distribute('c', 1, 5)).toBeUndefined();

        const single = make(queue(), ['a']);
        expect(await single.distributor.distribute('c', 1, 5)).toBe('a');
        expect(single.strategy.choose).not.toHaveBeenCalled();

        expect(await make(queue(), ['a', 'b']).distributor.distribute('c', 1, 5)).toBe('b');
    });
});

describe('QueueEligibility (RN-FIL-06)', () => {
    const perms = (over: Partial<CompanyPermission> = {}) => ({ forCompany: async () => ({ transfer_online_users: false, ...over }) as CompanyPermission });
    const repo = {
        membersOf: vi.fn(async () => ['ana', 'bia']),
        usersByIds: vi.fn(async (_c: string, ids: string[]) => ids.map((id) => ({ id, name: id, nickname: null, email: `${id}@x.com` }))),
    };
    const presence = { onlineAmong: async (ids: string[]) => new Set(ids.filter((id) => id === 'ana')) };

    it('transferência: todos da fila + conexão; com "só online" ligado, só quem está online; conexão 0 = só a fila', async () => {
        const all = new QueueEligibility(repo, perms(), presence, async (ids) => ids);
        expect((await all.transferTargets('c', 1, 5)).map((u) => u.id)).toEqual(['ana', 'bia']);
        await all.transferTargets('c', 1, 0);
        expect(repo.membersOf).toHaveBeenLastCalledWith('c', 1, null);

        const online = new QueueEligibility(repo, perms({ transfer_online_users: true }), presence, async (ids) => ids);
        expect((await online.transferTargets('c', 1, 5)).map((u) => u.id)).toEqual(['ana']);
    });

    it('distribuição: sempre só online, e depois o filtro de vagas', async () => {
        const capacity = vi.fn(async (ids: string[]) => ids.filter((id) => id !== 'ana'));
        expect(await new QueueEligibility(repo, perms(), presence, capacity).candidates('c', 1, 5)).toEqual([]);
        expect(capacity).toHaveBeenCalledWith(['ana'], expect.anything());
    });
});

describe('FilaService', () => {
    const make = (over: Partial<QueueRepository> = {}) => {
        const repo = {
            findById: vi.fn(async (id: number) => ({ id }) as Queue),
            update: vi.fn(async (id: number) => ({ id }) as Queue),
            detachPendingTickets: vi.fn(async () => {}),
            isUsedByActiveBot: vi.fn(async () => false),
            softDelete: vi.fn(async () => {}),
            ...over,
        } as unknown as QueueRepository;
        return { repo, service: new FilaService(repo) };
    };

    it('desativar solta os tickets pendentes; outras edições não', async () => {
        const off = make();
        await off.service.update(1, 'c', { enabled: false });
        expect(off.repo.detachPendingTickets).toHaveBeenCalledWith(1, 'c');

        const rename = make();
        await rename.service.update(1, 'c', { name: 'Nova' });
        expect(rename.repo.detachPendingTickets).not.toHaveBeenCalled();
    });

    it('excluir: inexistente → 404; usada por bot ativo → 409 sem excluir', async () => {
        await expect(make({ findById: vi.fn(async () => null) }).service.remove(1, 'c')).rejects.toEqual(new NotFoundError('Fila não encontrada'));

        const linked = make({ isUsedByActiveBot: vi.fn(async () => true) });
        await expect(linked.service.remove(1, 'c')).rejects.toBeInstanceOf(FilaVinculadaChatbotError);
        expect(linked.repo.softDelete).not.toHaveBeenCalled();
    });
});
