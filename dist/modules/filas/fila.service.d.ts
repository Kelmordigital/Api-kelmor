import { Queue } from '../atendimento/atendimento.db.schema';
export declare const filaService: {
    list(companyId: string): Promise<Queue[]>;
    findById(id: number, companyId: string): Promise<Queue | null>;
    create(companyId: string, payload: {
        name: string;
        color?: string | null;
        greeting_message?: string | null;
        enabled?: boolean;
    }): Promise<Queue>;
    update(id: number, companyId: string, payload: {
        name?: string;
        color?: string | null;
        greeting_message?: string | null;
        enabled?: boolean;
    }): Promise<Queue | null>;
    remove(id: number, companyId: string): Promise<boolean>;
};
//# sourceMappingURL=fila.service.d.ts.map