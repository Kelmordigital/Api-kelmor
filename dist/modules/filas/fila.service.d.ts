import { Queue } from '../atendimento/atendimento.db.schema';
export declare class FilaVinculadaChatbotError extends Error {
    constructor();
}
export declare const filaService: {
    list(companyId: string): Promise<Queue[]>;
    /** Lista paginada com busca por nome. */
    listAll(companyId: string, params?: {
        page?: number;
        perPage?: number;
        search?: string;
    }): Promise<{
        queues: {
            id: number;
            company_id: string;
            name: string;
            color: string | null;
            enabled: boolean | null;
            greeting_message: string | null;
            distribution: string;
            deleted_at: Date | null;
        }[];
        count: number;
        page: number;
        totalPages: number;
    }>;
    /** Filas às quais o usuário está vinculado. */
    listUserQueues(companyId: string, userId: string): Promise<Queue[]>;
    /** Apenas filas ativas (para seletores). */
    listActive(companyId: string): Promise<Queue[]>;
    /** Filas ativas vinculadas a uma conexão (usado no roteamento automático de ticket novo). */
    findActiveQueuesByConnection(connectionId: number): Promise<Queue[]>;
    findById(id: number, companyId: string): Promise<Queue | null>;
    /**
     * Atendentes elegíveis para atender/transferir nesta fila usando esta conexão:
     * pertencem à fila E têm acesso à conexão. Se connectionId for 0/ausente
     * (ticket sem connection_id), a elegibilidade considera só a fila.
     * Se transfer_online_users estiver ligado na empresa, filtra também por quem está online.
     */
    eligibleUsers(companyId: string, queueId: number, connectionId: number): Promise<{
        id: string;
        name: string;
        nickname: string | null;
        email: string;
    }[]>;
    create(companyId: string, payload: {
        name: string;
        color?: string | null;
        greeting_message?: string | null;
        enabled?: boolean;
        distribution?: string;
    }): Promise<Queue>;
    update(id: number, companyId: string, payload: {
        name?: string;
        color?: string | null;
        greeting_message?: string | null;
        enabled?: boolean;
        distribution?: string;
    }): Promise<Queue | null>;
    /** Soft delete. Bloqueia se a fila estiver vinculada a um bot ativo. */
    remove(id: number, companyId: string): Promise<boolean>;
};
//# sourceMappingURL=fila.service.d.ts.map