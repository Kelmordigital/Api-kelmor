import type { CalendarSync } from '../integracoes/calendar-sync';
import type { Agendamento } from './agenda.db.schema';
import type { AgendamentoRepository } from './agenda.repository';
import type { AgendaPeriod } from './agenda-period';
import type { CreateAgendamentoInput, UpdateAgendamentoInput } from './agenda.dto';
/**
 * Agendamentos da empresa. Cada alteração é espelhada na agenda externa
 * (CalendarSync) em melhor esforço: falha lá nunca desfaz nada aqui.
 */
export declare class AgendaService {
    private readonly repository;
    private readonly calendar;
    constructor(repository: AgendamentoRepository, calendar: CalendarSync);
    list(companyId: string, period: AgendaPeriod): Promise<Agendamento[]>;
    create(companyId: string, userId: string, input: CreateAgendamentoInput): Promise<Agendamento>;
    update(id: string, companyId: string, input: UpdateAgendamentoInput): Promise<Agendamento>;
    remove(id: string, companyId: string): Promise<void>;
    /** Início e fim iguais são permitidos (evento sem duração). */
    private static assertEndNotBeforeStart;
    private static toCalendarEvent;
    private static orNotFound;
}
//# sourceMappingURL=agenda.service.d.ts.map