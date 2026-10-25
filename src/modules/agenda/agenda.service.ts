import { BadRequestError, NotFoundError } from '../../core/errors/http-errors';
import type { CalendarEvent, CalendarSync } from '../integracoes/calendar-sync';
import type { Agendamento } from './agenda.db.schema';
import type { AgendamentoPatch, AgendamentoRepository } from './agenda.repository';
import type { AgendaPeriod } from './agenda-period';
import type { CreateAgendamentoInput, UpdateAgendamentoInput } from './agenda.dto';

const DEFAULT_COLOR = '#6366f1';

/**
 * Agendamentos da empresa. Cada alteração é espelhada na agenda externa
 * (CalendarSync) em melhor esforço: falha lá nunca desfaz nada aqui.
 */
export class AgendaService {
    constructor(
        private readonly repository: AgendamentoRepository,
        private readonly calendar: CalendarSync,
    ) {}

    list(companyId: string, period: AgendaPeriod): Promise<Agendamento[]> {
        return this.repository.listStartingBetween(companyId, period.start, period.end);
    }

    async create(companyId: string, userId: string, input: CreateAgendamentoInput): Promise<Agendamento> {
        if (!input.start_at || !input.end_at) throw new BadRequestError('start_at e end_at são obrigatórios');
        AgendaService.assertEndNotBeforeStart(input.start_at, input.end_at);

        const row = await this.repository.create(companyId, userId, {
            title:            input.title,
            lead_id:          input.lead_id ?? null,
            start_at:         input.start_at,
            end_at:           input.end_at,
            color:            input.color ?? DEFAULT_COLOR,
            notes:            input.notes ?? null,
            notify_on_create: input.notify_on_create ?? true,
            reminder_minutes: input.reminder_minutes ?? null,
            remind_at_exact:  input.remind_at_exact ?? false,
            notify_groups:    input.notify_groups ?? [],
        });

        const googleEventId = await this.calendar.createEvent(companyId, AgendaService.toCalendarEvent(row));
        if (!googleEventId) return row;
        try {
            return await this.repository.setGoogleEventId(row.id, googleEventId);
        } catch (err) {
            console.error('[agenda] Erro ao salvar o id do evento do Google Calendar:', err);
            return row;
        }
    }

    async update(id: string, companyId: string, input: UpdateAgendamentoInput): Promise<Agendamento> {
        const existing = AgendaService.orNotFound(await this.repository.findById(id, companyId));
        AgendaService.assertEndNotBeforeStart(input.start_at ?? existing.start_at, input.end_at ?? existing.end_at);

        const patch: AgendamentoPatch = {};
        for (const [key, value] of Object.entries(input)) {
            if (value !== undefined) Object.assign(patch, { [key]: value });
        }

        const row = AgendaService.orNotFound(await this.repository.update(id, companyId, patch));
        if (row.google_event_id) {
            await this.calendar.updateEvent(companyId, row.google_event_id, AgendaService.toCalendarEvent(row));
        }
        return row;
    }

    async remove(id: string, companyId: string): Promise<void> {
        const row = AgendaService.orNotFound(await this.repository.delete(id, companyId));
        if (row.google_event_id) await this.calendar.deleteEvent(companyId, row.google_event_id);
    }

    /** Início e fim iguais são permitidos (evento sem duração). */
    private static assertEndNotBeforeStart(start: Date, end: Date): void {
        if (end.getTime() < start.getTime()) throw new BadRequestError('end_at não pode ser antes de start_at');
    }

    private static toCalendarEvent(row: Agendamento): CalendarEvent {
        return { title: row.title, start_at: row.start_at, end_at: row.end_at, notes: row.notes };
    }

    private static orNotFound(row: Agendamento | null): Agendamento {
        if (!row) throw new NotFoundError('Agendamento não encontrado');
        return row;
    }
}
