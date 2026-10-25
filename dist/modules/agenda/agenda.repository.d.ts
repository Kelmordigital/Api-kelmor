import type { DB } from '../../database/client';
import { Agendamento, NewAgendamento } from './agenda.db.schema';
export type AgendamentoData = Omit<NewAgendamento, 'id' | 'company_id' | 'created_by' | 'google_event_id' | 'created_at' | 'updated_at'>;
export type AgendamentoPatch = Partial<AgendamentoData>;
/** Persistência de agendamentos, sempre escopada pela empresa. */
export interface AgendamentoRepository {
    /** Agendamentos que começam dentro do intervalo (inclusivo), em ordem de início. */
    listStartingBetween(companyId: string, start: Date, end: Date): Promise<Agendamento[]>;
    findById(id: string, companyId: string): Promise<Agendamento | null>;
    create(companyId: string, createdBy: string, data: AgendamentoData): Promise<Agendamento>;
    update(id: string, companyId: string, patch: AgendamentoPatch): Promise<Agendamento | null>;
    setGoogleEventId(id: string, googleEventId: string): Promise<Agendamento>;
    /** Devolve o agendamento apagado, ou null se não existia. */
    delete(id: string, companyId: string): Promise<Agendamento | null>;
}
export declare class DrizzleAgendamentoRepository implements AgendamentoRepository {
    private readonly db;
    constructor(db: DB);
    listStartingBetween(companyId: string, start: Date, end: Date): Promise<Agendamento[]>;
    findById(id: string, companyId: string): Promise<Agendamento | null>;
    create(companyId: string, createdBy: string, data: AgendamentoData): Promise<Agendamento>;
    update(id: string, companyId: string, patch: AgendamentoPatch): Promise<Agendamento | null>;
    setGoogleEventId(id: string, googleEventId: string): Promise<Agendamento>;
    delete(id: string, companyId: string): Promise<Agendamento | null>;
    private byIdInCompany;
}
//# sourceMappingURL=agenda.repository.d.ts.map