import { eq, and, between, asc } from 'drizzle-orm';
import type { DB } from '../../database/client';
import { agendamentos, Agendamento, NewAgendamento } from './agenda.db.schema';

export type AgendamentoData  = Omit<NewAgendamento, 'id' | 'company_id' | 'created_by' | 'google_event_id' | 'created_at' | 'updated_at'>;
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

export class DrizzleAgendamentoRepository implements AgendamentoRepository {
    constructor(private readonly db: DB) {}

    async listStartingBetween(companyId: string, start: Date, end: Date): Promise<Agendamento[]> {
        return this.db
            .select()
            .from(agendamentos)
            .where(and(eq(agendamentos.company_id, companyId), between(agendamentos.start_at, start, end)))
            .orderBy(asc(agendamentos.start_at));
    }

    async findById(id: string, companyId: string): Promise<Agendamento | null> {
        const [row] = await this.db
            .select()
            .from(agendamentos)
            .where(this.byIdInCompany(id, companyId))
            .limit(1);
        return row ?? null;
    }

    async create(companyId: string, createdBy: string, data: AgendamentoData): Promise<Agendamento> {
        const [row] = await this.db
            .insert(agendamentos)
            .values({ ...data, company_id: companyId, created_by: createdBy })
            .returning();
        return row;
    }

    async update(id: string, companyId: string, patch: AgendamentoPatch): Promise<Agendamento | null> {
        const [row] = await this.db
            .update(agendamentos)
            .set({ ...patch, updated_at: new Date() })
            .where(this.byIdInCompany(id, companyId))
            .returning();
        return row ?? null;
    }

    async setGoogleEventId(id: string, googleEventId: string): Promise<Agendamento> {
        const [row] = await this.db
            .update(agendamentos)
            .set({ google_event_id: googleEventId })
            .where(eq(agendamentos.id, id))
            .returning();
        return row;
    }

    async delete(id: string, companyId: string): Promise<Agendamento | null> {
        const [row] = await this.db
            .delete(agendamentos)
            .where(this.byIdInCompany(id, companyId))
            .returning();
        return row ?? null;
    }

    private byIdInCompany(id: string, companyId: string) {
        return and(eq(agendamentos.id, id), eq(agendamentos.company_id, companyId));
    }
}
