import { eq, and, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../../core/database/executor';
import type { CompanyPermissionsReader } from '../../configuracao-geral/configuracao-geral.service';
import type { ResearchSurvey } from '../../pesquisas/pesquisa.service';
import { users } from '../../auth/auth.schema';
import { tickets, type Ticket } from '../atendimento.db.schema';
import type { AtendimentoEvents } from '../atendimento.ports';
import { PesquisaNaoConfiguradaError, TicketNaoEncontradoError } from '../atendimento.errors';
import { assertTransition } from './ticket-transitions';
import { insertHistory, loadTicket, updateIfStatus } from './ticket-assignment.service';
import type { AutomaticMessages } from './automatic-messages';

export interface CloseOptions { ocurrence?: string; service_not_made?: boolean; sendGoodbye?: boolean }
export interface SalePayload { isSale: boolean; saleAmount?: string; lossReasonId?: number; lossProductName?: string }

/** Fechamento (direto ou com pesquisa), classificação de venda e XP do mini-game. */
export class TicketClosingService {
    constructor(
        private readonly db: DbExecutor,
        private readonly perms: CompanyPermissionsReader,
        private readonly research: Pick<ResearchSurvey, 'findActiveForQueue' | 'sendSurveyQuestion'>,
        private readonly events: AtendimentoEvents,
        private readonly automatic: Pick<AutomaticMessages, 'sendGoodbye' | 'closeConfig'>,
    ) {}

    /**
     * XP de Conquistas: só quando o próprio fechamento é uma venda (is_sale = 1 no momento em
     * que o fechamento se efetiva). Contador real (users.xp), valor configurável (sale_xp_amount).
     */
    private async grantSaleXp(userId: string, companyId: string): Promise<void> {
        const perms = await this.perms.forCompany(companyId);
        if (!perms.gamification_enabled) return;
        await this.db.update(users).set({ xp: sql`${users.xp} + ${perms.sale_xp_amount}` }).where(eq(users.id, userId));
    }

    async closeTicket(ticketId: number, userId: string, companyId: string, opts: CloseOptions = {}): Promise<Ticket> {
        const current = await loadTicket(this.db, ticketId, companyId);
        assertTransition('fechar', current.status_id);

        const updated = await updateIfStatus(this.db, ticketId, companyId, current.status_id, {
            status_id: 3,
            closed_by_user_id: userId,
            ocurrence: opts.ocurrence ?? null,
            service_not_made: opts.service_not_made ? 1 : 0,
            pinned: 0,
            updated_at: new Date(),
        });
        await insertHistory(this.db, ticketId, userId, current.status_id, 3);
        if (current.is_sale === 1) await this.grantSaleXp(userId, companyId);
        this.events.ticketClosed(companyId, ticketId);

        // Despedida em segundo plano: falha no envio não impede o fechamento, mas é logada.
        this.automatic.sendGoodbye(updated, companyId, opts.sendGoodbye, userId).catch((err: unknown) =>
            console.error(`[Close] Falha ao enviar mensagem de despedida (ticket ${ticketId}):`, err instanceof Error ? err.message : err));
        return updated;
    }

    /**
     * Alternativa exclusiva à despedida: pergunta a pesquisa de satisfação. O ticket vai para
     * Pesquisa (7) e só fecha de fato quando o cliente responder (finalizeAfterResearch).
     */
    async closeTicketWithResearch(ticketId: number, userId: string, companyId: string): Promise<Ticket> {
        const current = await loadTicket(this.db, ticketId, companyId);
        assertTransition('fecharComPesquisa', current.status_id);
        const research = await this.research.findActiveForQueue(current.queue_id, companyId);
        if (!research) throw new PesquisaNaoConfiguradaError();

        const updated = await updateIfStatus(this.db, ticketId, companyId, current.status_id, {
            status_id: 7, closed_by_user_id: userId, pinned: 0, updated_at: new Date(),
        });
        await insertHistory(this.db, ticketId, userId, current.status_id, 7);
        this.events.ticketUpdated(companyId, updated);
        await this.research.sendSurveyQuestion(updated, research);
        return updated;
    }

    /** Fecha de fato depois que a pesquisa foi respondida (7 → 3). Outros status: ignora. */
    async finalizeAfterResearch(ticketId: number, companyId: string): Promise<void> {
        const [current] = await this.db.select().from(tickets).where(and(eq(tickets.id, ticketId), eq(tickets.company_id, companyId))).limit(1);
        if (!current || current.status_id !== 7) return;

        const [closed] = await this.db.update(tickets).set({ status_id: 3, updated_at: new Date() })
            .where(and(eq(tickets.id, ticketId), eq(tickets.status_id, 7))).returning();
        if (!closed) return;
        await insertHistory(this.db, ticketId, current.closed_by_user_id, 7, 3);
        if (current.is_sale === 1 && current.closed_by_user_id) await this.grantSaleXp(current.closed_by_user_id, companyId);
        this.events.ticketClosed(companyId, ticketId);
    }

    async registerSale(ticketId: number, companyId: string, payload: SalePayload): Promise<Ticket> {
        const set = payload.isSale
            ? { is_sale: 1, sale_price: payload.saleAmount ?? '0,00', reasons_id: null as number | null, loss_product_name: null as string | null }
            : { is_sale: 0, sale_price: '0,00', reasons_id: payload.lossReasonId ?? null, loss_product_name: payload.lossProductName ?? null };
        const [updated] = await this.db.update(tickets).set({ ...set, updated_at: new Date() })
            .where(and(eq(tickets.id, ticketId), eq(tickets.company_id, companyId))).returning();
        if (!updated) throw new TicketNaoEncontradoError();
        return updated;
    }

    /** O ticket tem pesquisa disponível (fila vinculada a uma pesquisa ativa)? */
    async researchAvailable(ticketId: number, companyId: string): Promise<{ available: boolean; name: string | null }> {
        const ticket = await loadTicket(this.db, ticketId, companyId);
        const research = await this.research.findActiveForQueue(ticket.queue_id, companyId);
        return { available: !!research, name: research?.name ?? null };
    }

    closeConfig(companyId: string) {
        return this.automatic.closeConfig(companyId);
    }
}
