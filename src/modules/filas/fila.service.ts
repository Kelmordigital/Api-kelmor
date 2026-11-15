import { ConflictError, NotFoundError } from '../../core/errors/http-errors';
import type { Pagination } from '../../core/http/pagination';
import type { Queue } from '../atendimento/atendimento.db.schema';
import type { CompanyPermissionsReader } from '../configuracao-geral/configuracao-geral.service';
import type { CompanyPermission } from '../configuracao-geral/configuracao-geral.db.schema';
import type { EligibleUser, QueueRepository } from './fila.repository';
import type { EligibilityFilter } from './queue-distribution';
import type { CreateFilaInput, UpdateFilaInput } from './fila.dto';

export class FilaVinculadaChatbotError extends ConflictError {
    constructor() { super('Não é possível excluir a fila, pois ela está vinculada a um chatbot.'); }
}

/** Quem está com o sistema aberto agora. */
export interface UserPresence {
    /** Quem, dentre os ids, está online em qualquer cópia da API. */
    onlineAmong(userIds: string[]): Promise<Set<string>>;
}

/** Tira quem já está no limite de atendimentos simultâneos. */
export type CapacityFilter = (userIds: string[], perms: CompanyPermission) => Promise<string[]>;

/** Cadastro e consulta de filas da empresa. */
export class FilaService {
    constructor(private readonly repository: QueueRepository) {}

    list(companyId: string) {
        return this.repository.list(companyId);
    }

    async search(companyId: string, pagination: Pagination, term?: string) {
        const { rows, count } = await this.repository.search(companyId, pagination, term);
        return { queues: rows, count, page: pagination.page, totalPages: Math.max(1, Math.ceil(count / pagination.limit)) };
    }

    listForUser(companyId: string, userId: string) {
        return this.repository.listForUser(companyId, userId);
    }

    listActive(companyId: string) {
        return this.repository.listActive(companyId);
    }

    async get(id: number, companyId: string): Promise<Queue> {
        const queue = await this.repository.findById(id, companyId);
        if (!queue) throw FilaService.notFound();
        return queue;
    }

    create(companyId: string, input: CreateFilaInput) {
        return this.repository.create(companyId, input);
    }

    /** RN-FIL-04: desativar tira a fila dos tickets que ainda aguardam atendente. */
    async update(id: number, companyId: string, input: UpdateFilaInput) {
        const queue = await this.repository.update(id, companyId, input);
        if (!queue) throw FilaService.notFound();
        if (input.enabled === false) await this.repository.detachPendingTickets(id, companyId);
        return queue;
    }

    /** RN-FIL-05: exclusão lógica, bloqueada se um bot ativo transfere para a fila. */
    async remove(id: number, companyId: string): Promise<void> {
        await this.get(id, companyId);
        if (await this.repository.isUsedByActiveBot(id, companyId)) throw new FilaVinculadaChatbotError();
        await this.repository.softDelete(id, companyId);
    }

    private static notFound() {
        return new NotFoundError('Fila não encontrada');
    }
}

/**
 * Quem pode atender um ticket de uma fila: está na fila e tem a conexão
 * (RN-FIL-06). Base da transferência e da distribuição automática.
 */
export class QueueEligibility implements EligibilityFilter {
    constructor(
        private readonly repository: Pick<QueueRepository, 'membersOf' | 'usersByIds'>,
        private readonly permissions: CompanyPermissionsReader,
        private readonly presence: UserPresence,
        private readonly capacity: CapacityFilter,
    ) {}

    /** Filtra os online preservando a ordem (a distribuição depende dela). */
    private async onlineIn(ids: string[]): Promise<string[]> {
        const online = await this.presence.onlineAmong(ids);
        return ids.filter((id) => online.has(id));
    }

    /** Para transferir: com "só online" ligado na empresa, só quem está online. connectionId 0 = só a fila. */
    async transferTargets(companyId: string, queueId: number, connectionId: number): Promise<EligibleUser[]> {
        const [members, perms] = await Promise.all([
            this.repository.membersOf(companyId, queueId, connectionId || null),
            this.permissions.forCompany(companyId),
        ]);
        const ids = perms.transfer_online_users ? await this.onlineIn(members) : members;
        return this.repository.usersByIds(companyId, ids);
    }

    /** Para a distribuição automática: sempre online e com vaga (limite de atendimentos). */
    async candidates(companyId: string, queueId: number, connectionId: number): Promise<string[]> {
        const online = await this.onlineIn(await this.repository.membersOf(companyId, queueId, connectionId));
        if (online.length === 0) return [];
        return this.capacity(online, await this.permissions.forCompany(companyId));
    }
}
