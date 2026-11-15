import { eq, and, ne, or, gte, inArray, isNull, desc, sql, type SQL } from 'drizzle-orm';
import type { DbExecutor } from '../../../core/database/executor';
import { tickets, contacts, type Ticket } from '../atendimento.db.schema';
import type { AtendimentoEvents, ContactResolver } from '../atendimento.ports';
import { EtapaInvalidaError, FunilDestinoInvalidoError, FunilMovimentoNaoAutorizadoError } from '../atendimento.errors';
import { isAdminTag } from '../tickets/ticket-access';
import { loadTicket } from '../tickets/ticket-assignment.service';
import type { TicketAssignmentService } from '../tickets/ticket-assignment.service';
import type { ContactReportService } from '../contatos/contact-report.service';
import type { FunilStageService } from './funil-stage.service';

export interface FunilCard {
    id: number;
    funil_stage_id: number;
    contact_id: number;
    contact_name: string;
    contact_number: string | null;
    contact_profile_pic_url: string | null;
    status_id: number;
    attendant_user_id: string | null;
    created_at: Date | null;
}

/** Ações reais de negócio que mover um card dispara. */
export type FunilTicketActions = Pick<TicketAssignmentService, 'assignAttendant' | 'reopen' | 'returnToQueue'>;

/** Quadro Kanban do atendimento: cards, lead manual e mover card entre colunas. */
export class FunilBoardService {
    constructor(
        private readonly db: DbExecutor,
        private readonly stages: FunilStageService,
        private readonly resolver: Pick<ContactResolver, 'findOrCreate'>,
        private readonly contactSearch: Pick<ContactReportService, 'idsMatching'>,
        private readonly actions: FunilTicketActions,
        private readonly events: AtendimentoEvents,
    ) {}

    async createFunilLead(companyId: string, payload: { name?: string; phone?: string; email?: string; notes?: string; funil_stage_id?: number }): Promise<FunilCard> {
        const stages = await this.stages.listStages(companyId);
        const middleStages = stages.filter((s) => !s.is_waiting_stage && !s.is_finished_stage);
        if (payload.funil_stage_id !== undefined && !middleStages.some((s) => s.id === payload.funil_stage_id)) {
            throw new EtapaInvalidaError();
        }

        let contact;
        if (payload.phone?.trim()) {
            contact = await this.resolver.findOrCreate(companyId, payload.phone.trim(), payload.name?.trim() || undefined);
            if (payload.name?.trim() || payload.email?.trim()) {
                const [updated] = await this.db.update(contacts).set({
                    ...(payload.name?.trim() && { name: payload.name.trim() }),
                    ...(payload.email?.trim() && { email: payload.email.trim() }),
                }).where(eq(contacts.id, contact.id)).returning();
                contact = updated ?? contact;
            }
        } else {
            [contact] = await this.db.insert(contacts).values({
                company_id: companyId, name: payload.name?.trim() || 'Sem nome', email: payload.email?.trim() || null, origin: 'funil_manual',
            }).returning();
        }

        const [ticket] = await this.db.insert(tickets).values({
            company_id: companyId,
            contact_id: contact.id,
            status_id: 1,
            funil_stage_id: payload.funil_stage_id ?? middleStages[0].id,
            origin: 'funil_manual',
            ocurrence: payload.notes?.trim() || null,
        }).returning();
        this.events.ticketCreated(companyId, ticket);

        const waitingStage = stages.find((s) => s.is_waiting_stage)!;
        await this.stages.recordStageEntry(companyId, ticket.id, waitingStage.id);

        return {
            id: ticket.id,
            funil_stage_id: this.stages.resolveEffectiveStageId(ticket, stages),
            contact_id: contact.id,
            contact_name: contact.name,
            contact_number: contact.number ?? null,
            contact_profile_pic_url: contact.profile_pic_url ?? null,
            status_id: 1,
            attendant_user_id: null,
            created_at: ticket.created_at,
        };
    }

    async getFunilCards(companyId: string, search?: string): Promise<FunilCard[]> {
        const conditions: SQL[] = [
            eq(tickets.company_id, companyId),
            isNull(tickets.deleted_at) as SQL,
            // Finalizado some do quadro 24h depois de fechar.
            or(ne(tickets.status_id, 3), gte(tickets.updated_at, sql`now() - interval '24 hours'`)) as SQL,
        ];
        if (search) {
            const ids = await this.contactSearch.idsMatching(companyId, search.trim());
            if (ids.length === 0) return [];
            conditions.push(inArray(tickets.contact_id, ids));
        }

        const [stages, rows] = await Promise.all([
            this.stages.listStages(companyId),
            this.db.select({
                id: tickets.id,
                funil_stage_id: tickets.funil_stage_id,
                contact_id: tickets.contact_id,
                contact_name: contacts.name,
                contact_number: contacts.number,
                contact_profile_pic_url: contacts.profile_pic_url,
                status_id: tickets.status_id,
                attendant_user_id: tickets.attendant_user_id,
                created_at: tickets.created_at,
            }).from(tickets).leftJoin(contacts, eq(tickets.contact_id, contacts.id)).where(and(...conditions)).orderBy(desc(tickets.created_at)),
        ]);
        return rows.map((row) => ({ ...row, funil_stage_id: this.stages.resolveEffectiveStageId(row, stages) })) as FunilCard[];
    }

    /**
     * Drag-and-drop do Kanban: mover um card sempre dispara a ação real equivalente
     * (assumir/reabrir/devolver, cada uma com suas checagens). Finalizado nunca é destino:
     * fechar exige classificar a venda (fluxo separado).
     */
    async moveTicketFunilStage(ticketId: number, destinationStageId: number, userId: string, companyId: string, profileTag: string): Promise<Ticket> {
        const current = await loadTicket(this.db, ticketId, companyId);
        const stages = await this.stages.listStages(companyId);
        const destination = stages.find((s) => s.id === destinationStageId);
        if (!destination) throw new FunilDestinoInvalidoError('Etapa de destino não encontrada.');

        if (this.stages.resolveEffectiveStageId(current, stages) === destinationStageId) return current;
        if (destination.is_finished_stage) {
            throw new FunilDestinoInvalidoError('Fechar o atendimento pelo Kanban exige classificar a venda — use o fluxo de fechamento.');
        }
        if (current.status_id === 3 && destination.is_waiting_stage) {
            throw new FunilDestinoInvalidoError('Reabra o atendimento antes de devolver para a fila.');
        }

        const setStage = async () => {
            const [updated] = await this.db.update(tickets).set({ funil_stage_id: destinationStageId }).where(eq(tickets.id, ticketId)).returning();
            await this.stages.recordStageEntry(companyId, ticketId, destinationStageId);
            return updated;
        };

        if (current.status_id === 3) {
            const reopened = await this.actions.reopen(ticketId, userId, companyId, profileTag);
            return (await setStage()) ?? reopened;
        }
        if (current.status_id === 1 || current.status_id === 9) {
            const accepted = await this.actions.assignAttendant(ticketId, userId, companyId);
            return (await setStage()) ?? accepted;
        }
        if (destination.is_waiting_stage) {
            const returned = await this.actions.returnToQueue(ticketId, userId, companyId, profileTag);
            await this.stages.recordStageEntry(companyId, ticketId, destinationStageId);
            return returned;
        }

        if (current.attendant_user_id !== userId && !isAdminTag(profileTag)) throw new FunilMovimentoNaoAutorizadoError();

        const [updated] = await this.db.update(tickets).set({ funil_stage_id: destinationStageId, updated_at: new Date() }).where(eq(tickets.id, ticketId)).returning();
        this.events.ticketUpdated(companyId, updated);
        await this.stages.recordStageEntry(companyId, ticketId, destinationStageId);
        return updated;
    }
}
