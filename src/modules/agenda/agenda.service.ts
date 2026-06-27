import { eq, and, between } from 'drizzle-orm';
import { db } from '../../database/client';
import { agendamentos, Agendamento, NewAgendamento } from './agenda.db.schema';
import { integracaoService } from '../integracoes/integracao.service';
import {
    createCalendarEvent,
    updateCalendarEvent,
    deleteCalendarEvent,
} from '../integracoes/google-calendar.client';

export const agendaService = {

    async list(companyId: string, start: Date, end: Date): Promise<Agendamento[]> {
        return db
            .select()
            .from(agendamentos)
            .where(
                and(
                    eq(agendamentos.company_id, companyId),
                    between(agendamentos.start_at, start, end),
                ),
            );
    },

    async create(
        companyId: string,
        userId: string,
        payload: Omit<NewAgendamento, 'id' | 'company_id' | 'created_by' | 'google_event_id' | 'created_at' | 'updated_at'>,
    ): Promise<Agendamento> {
        const [row] = await db
            .insert(agendamentos)
            .values({ ...payload, company_id: companyId, created_by: userId })
            .returning();

        const integration = await integracaoService.getValidTokens(companyId);
        if (integration) {
            try {
                const googleId = await createCalendarEvent(
                    integration.access_token,
                    integration.refresh_token,
                    { title: row.title, start_at: row.start_at, end_at: row.end_at, notes: row.notes },
                );
                const [updated] = await db
                    .update(agendamentos)
                    .set({ google_event_id: googleId })
                    .where(eq(agendamentos.id, row.id))
                    .returning();
                return updated;
            } catch (err) {
                console.error('[agenda] Erro ao sincronizar com Google Calendar:', err);
            }
        }

        return row;
    },

    async update(
        id: string,
        companyId: string,
        payload: Partial<Pick<Agendamento, 'title' | 'lead_id' | 'start_at' | 'end_at' | 'color' | 'notes' | 'notify_on_create' | 'reminder_minutes' | 'remind_at_exact' | 'notify_groups'>>,
    ): Promise<Agendamento | null> {
        const [row] = await db
            .update(agendamentos)
            .set({ ...payload, updated_at: new Date() })
            .where(and(eq(agendamentos.id, id), eq(agendamentos.company_id, companyId)))
            .returning();

        if (!row) return null;

        if (row.google_event_id) {
            const integration = await integracaoService.getValidTokens(companyId);
            if (integration) {
                try {
                    await updateCalendarEvent(
                        integration.access_token,
                        integration.refresh_token,
                        row.google_event_id,
                        { title: row.title, start_at: row.start_at, end_at: row.end_at, notes: row.notes },
                    );
                } catch (err) {
                    console.error('[agenda] Erro ao atualizar evento no Google Calendar:', err);
                }
            }
        }

        return row;
    },

    async remove(id: string, companyId: string): Promise<boolean> {
        const [row] = await db
            .delete(agendamentos)
            .where(and(eq(agendamentos.id, id), eq(agendamentos.company_id, companyId)))
            .returning();

        if (!row) return false;

        if (row.google_event_id) {
            const integration = await integracaoService.getValidTokens(companyId);
            if (integration) {
                try {
                    await deleteCalendarEvent(
                        integration.access_token,
                        integration.refresh_token,
                        row.google_event_id,
                    );
                } catch (err) {
                    console.error('[agenda] Erro ao deletar evento do Google Calendar:', err);
                }
            }
        }

        return true;
    },
};
