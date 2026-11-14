import { and, asc, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import { db as defaultDb } from '../../database/client';
import { companies } from '../companies/company.db.schema';
import { companyPermissions } from '../configuracao-geral/configuracao-geral.db.schema';
import { emitToCompany } from '../../shared/socket';
import { historic_tickets, tickets, type Ticket } from './atendimento.db.schema';

/**
 * Fechamento automático de tickets (configurações "Fechar tickets abertos/pendentes após (h)").
 *
 * Regra do negócio: o ticket é finalizado sozinho quando fica X horas SEM NENHUMA MENSAGEM
 * (de ninguém: cliente, atendente ou bot), contando da última mensagem, ou da abertura se não
 * houver mensagem. X = intervalo de "pendentes" para o status 1 (ninguém respondeu) e de
 * "em aberto" para os status 2 e 9 (atendente/bot respondeu e o ticket continua aberto).
 * Pesquisa de satisfação (7) não entra: aguarda a resposta do cliente.
 *
 * Fechado sem venda registrada vira "venda não realizada" (is_sale = 0, sem motivo).
 *
 * Despedida: enviada (respeitando a configuração de despedida da empresa) só para quem
 * venceu agora. Tickets que já estavam vencidos há mais de BACKLOG_GRACE_HOURS (ex.: os
 * parados quando a regra foi ligada) fecham em silêncio — dezenas de mensagens de uma vez
 * para quem sumiu há semanas é o padrão que o WhatsApp bloqueia.
 */
export const AUTO_CLOSE_STATUSES = [1, 2, 9];
export const BACKLOG_GRACE_HOURS = 2;
const BATCH = 100;

export interface DueTicket {
    id: number;
    company_id: string;
    status_id: number;
    attendant_user_id: string | null;
    send_goodbye: boolean;
}

type Db = typeof defaultDb;
type ClosingMessenger = (ticket: Ticket, companyId: string, sendGoodbye: boolean | undefined, userId: string | null) => Promise<void>;

export class TicketAutoCloser {
    constructor(
        private readonly sendClosingMessage: ClosingMessenger,
        private readonly db: Db = defaultDb,
    ) {}

    /** Tickets vencidos pela regra, mais antigos primeiro. */
    async findDue(limit = BATCH): Promise<DueTicket[]> {
        // Horas do prazo conforme o status do ticket (pendente x aberto)
        const hours = sql<number>`case when ${tickets.status_id} = 1
            then ${companyPermissions.close_pending_tickets_interval}
            else ${companyPermissions.close_open_tickets_interval} end`;
        // Última atividade: a mensagem mais recente (de qualquer lado) ou a abertura do ticket
        const lastActivity = sql`greatest(${tickets.created_at},
            coalesce((select max(m.created_at) from at_messages m where m.ticket_id = ${tickets.id}), ${tickets.created_at}))`;
        // Momento em que o ticket passou a cumprir a regra: X horas depois da última atividade
        const eligibleAt = sql`(${lastActivity} + make_interval(hours => ${hours}))`;

        return this.db
            .select({
                id: tickets.id,
                company_id: tickets.company_id,
                status_id: tickets.status_id,
                attendant_user_id: tickets.attendant_user_id,
                send_goodbye: sql<boolean>`${eligibleAt} >= now() - make_interval(hours => ${BACKLOG_GRACE_HOURS})`,
            })
            .from(tickets)
            .innerJoin(companyPermissions, eq(companyPermissions.company_id, tickets.company_id))
            .innerJoin(companies, eq(companies.id, tickets.company_id))
            .where(and(
                isNull(tickets.deleted_at),
                inArray(tickets.status_id, AUTO_CLOSE_STATUSES),
                eq(companies.status, true), // empresa desativada não tem envio automático
                or(
                    and(
                        eq(tickets.status_id, 1),
                        eq(companyPermissions.close_pending_tickets, true),
                        gte(companyPermissions.close_pending_tickets_interval, 1),
                    ),
                    and(
                        inArray(tickets.status_id, [2, 9]),
                        eq(companyPermissions.close_open_tickets, true),
                        gte(companyPermissions.close_open_tickets_interval, 1),
                    ),
                ),
                sql`${lastActivity} <= now() - make_interval(hours => ${hours})`,
            ))
            .orderBy(asc(lastActivity))
            .limit(limit);
    }

    /**
     * Fecha só se o ticket ainda estiver aberto (UPDATE condicional): com várias
     * réplicas da API rodando o job, só uma fecha e só ela manda a despedida.
     */
    async close(due: DueTicket): Promise<Ticket | null> {
        const [closed] = await this.db.update(tickets)
            // Fechado sem venda registrada = venda não realizada (vai para os relatórios de não venda).
            // Se o atendente já marcou venda antes, mantém.
            .set({ status_id: 3, closed_by_user_id: null, pinned: 0, is_sale: sql`coalesce(${tickets.is_sale}, 0)`, updated_at: new Date() })
            .where(and(
                eq(tickets.id, due.id),
                inArray(tickets.status_id, AUTO_CLOSE_STATUSES),
                isNull(tickets.deleted_at),
            ))
            .returning();
        if (!closed) return null;

        await this.db.insert(historic_tickets).values({
            ticket_id: due.id, user_id: null, status_id_init: due.status_id, status_id_end: 3,
        });
        emitToCompany(due.company_id, 'ticket:closed', { ticketId: due.id });

        // undefined = respeita "enviar despedida" da empresa; false = fecha em silêncio
        await this.sendClosingMessage(closed, due.company_id, due.send_goodbye ? undefined : false, due.attendant_user_id)
            .catch((err: unknown) => console.error(
                `[AutoClose] Falha ao enviar despedida (ticket ${due.id}):`, err instanceof Error ? err.message : err,
            ));
        return closed;
    }

    /** Um ciclo: fecha um lote de vencidos. Devolve quantos fechou. */
    async run(): Promise<number> {
        const due = await this.findDue();
        let count = 0;
        for (const ticket of due) {
            if (await this.close(ticket)) count++;
        }
        if (count > 0) console.log(`[AutoClose] ${count} ticket(s) finalizado(s) automaticamente`);
        return count;
    }
}

/** Roda o fechamento a cada `intervalMs`; um ciclo por vez nesta instância. */
export class AutoCloseLoop {
    private timer: NodeJS.Timeout | null = null;
    private running = false;

    constructor(private readonly closer: Pick<TicketAutoCloser, 'run'>, private readonly intervalMs = 5 * 60_000) {}

    start(): void {
        if (this.timer) return;
        this.timer = setInterval(() => this.tick(), this.intervalMs);
        this.timer.unref();
        this.tick();
    }

    stop(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    tick(): void {
        if (this.running) return;
        this.running = true;
        this.closer.run()
            .catch((err) => console.error('[AutoClose] Erro no ciclo:', err instanceof Error ? err.message : err))
            .finally(() => { this.running = false; });
    }
}
