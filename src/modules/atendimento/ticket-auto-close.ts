import { and, asc, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import { db as defaultDb } from '../../database/client';
import { companies } from '../companies/company.db.schema';
import { companyPermissions } from '../configuracao-geral/configuracao-geral.db.schema';
import { emitToCompany } from '../../shared/socket';
import { historic_tickets, tickets, type Ticket } from './atendimento.db.schema';

/**
 * Fechamento automático de tickets (configurações "Fechar tickets abertos/pendentes após (h)").
 *
 * Regra do negócio: o ticket é finalizado sozinho quando
 *  - está aberto (Pendente 1, Em Atendimento 2 ou Bot 9) há pelo menos X horas desde a abertura
 *    (X = intervalo de pendentes para status 1, de abertos para 2 e 9), e
 *  - a ÚLTIMA mensagem do ticket é do cliente.
 * Pesquisa de satisfação (7) não entra: aguarda a resposta do cliente.
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
        const lastFromMe = sql`(select m.from_me from at_messages m where m.ticket_id = ${tickets.id}
            order by m.created_at desc, m.id desc limit 1)`;
        const lastClientAt = sql`(select max(m.created_at) from at_messages m
            where m.ticket_id = ${tickets.id} and m.from_me = false)`;
        // Momento em que o ticket passou a cumprir a regra: prazo vencido E última msg do cliente
        const eligibleAt = sql`greatest(${tickets.created_at} + make_interval(hours => ${hours}), ${lastClientAt})`;

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
                sql`${tickets.created_at} <= now() - make_interval(hours => ${hours})`,
                sql`${lastFromMe} = false`,
            ))
            .orderBy(asc(tickets.created_at))
            .limit(limit);
    }

    /**
     * Fecha só se o ticket ainda estiver aberto (UPDATE condicional): com várias
     * réplicas da API rodando o job, só uma fecha e só ela manda a despedida.
     */
    async close(due: DueTicket): Promise<Ticket | null> {
        const [closed] = await this.db.update(tickets)
            .set({ status_id: 3, closed_by_user_id: null, pinned: 0, updated_at: new Date() })
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
