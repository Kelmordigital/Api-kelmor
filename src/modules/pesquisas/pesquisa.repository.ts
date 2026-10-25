import { eq, and, inArray, gte, lte, desc, asc, sql, type SQL } from 'drizzle-orm';
import type { DB } from '../../database/client';
import { researchs, researchAnswers, queueResearchs, researchHistorics, Research, ResearchAnswer, ResearchHistoric } from './pesquisa.db.schema';
import { queues, tickets, contacts } from '../atendimento/atendimento.db.schema';
import { users } from '../auth/auth.schema';
import { answerChanges } from './survey-question';

export interface ResearchWithDetails extends Research {
    answers: ResearchAnswer[];
    queues: { research_id: number; queue_id: number; name: string; color: string | null }[];
}

export interface ResearchFields {
    name: string;
    type: string;
    active: boolean;
    default_research: boolean;
}

export interface ResearchChanges {
    fields: Partial<ResearchFields>;
    /** Substitui as opções (mantendo as de mesmo texto). */
    answers?: string[];
    /** Substitui as filas (só as da empresa entram). */
    queueIds?: number[];
}

export interface ReportPeriod {
    dateInit?: string;
    dateEnd?: string;
}

export interface AnswerTotal {
    research_id: number;
    research_name: string;
    research_active: boolean;
    answer_id: number;
    answer_title: string;
    total: number;
}

export interface AnsweredTicket {
    ticket_id: number;
    answered_at: Date | null;
    contact_name: string;
    contact_number: string | null;
    attendant_name: string | null;
}

type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];

export interface ResearchRepository {
    listWithDetails(companyId: string): Promise<ResearchWithDetails[]>;
    listActive(companyId: string): Promise<Research[]>;
    create(companyId: string, fields: ResearchFields, answers: string[], queueIds: number[]): Promise<Research>;
    /** Aplica as mudanças numa transação; false se a pesquisa não é da empresa. */
    update(id: number, companyId: string, changes: ResearchChanges): Promise<boolean>;
    delete(id: number, companyId: string): Promise<boolean>;
    /** Pesquisa ATIVA da empresa vinculada à fila (a mais recente, se houver várias). */
    findActiveForQueue(queueId: number, companyId: string): Promise<Research | null>;
    answersOf(researchId: number): Promise<ResearchAnswer[]>;
    createPending(entry: { company_id: string; ticket_id: number; research_id: number; contact_id: number }): Promise<void>;
    latestPending(companyId: string, contactId: number): Promise<ResearchHistoric | null>;
    markAnswered(historicId: number, answerId: number): Promise<void>;
    answerTotals(companyId: string, period: ReportPeriod, attendantId?: string): Promise<AnswerTotal[]>;
    answeredTickets(companyId: string, answerId: number, period: ReportPeriod, page: { limit: number; offset: number }): Promise<{ tickets: AnsweredTicket[]; total: number }>;
    companyUsers(companyId: string): Promise<{ id: string; name: string }[]>;
}

export class DrizzleResearchRepository implements ResearchRepository {
    constructor(private readonly db: DB) {}

    async listWithDetails(companyId: string): Promise<ResearchWithDetails[]> {
        const list = await this.db.select().from(researchs).where(eq(researchs.company_id, companyId));
        if (list.length === 0) return [];

        const ids = list.map((r) => r.id);
        const [answers, links] = await Promise.all([
            this.db.select().from(researchAnswers).where(inArray(researchAnswers.research_id, ids)).orderBy(asc(researchAnswers.id)),
            this.db.select({ research_id: queueResearchs.research_id, queue_id: queueResearchs.queue_id, name: queues.name, color: queues.color })
                .from(queueResearchs)
                .innerJoin(queues, eq(queueResearchs.queue_id, queues.id))
                .where(inArray(queueResearchs.research_id, ids)),
        ]);
        return list.map((r) => ({
            ...r,
            answers: answers.filter((a) => a.research_id === r.id),
            queues: links.filter((q) => q.research_id === r.id),
        }));
    }

    listActive(companyId: string): Promise<Research[]> {
        return this.db.select().from(researchs)
            .where(and(eq(researchs.company_id, companyId), eq(researchs.active, true)));
    }

    create(companyId: string, fields: ResearchFields, answers: string[], queueIds: number[]): Promise<Research> {
        return this.db.transaction(async (tx) => {
            if (fields.default_research) await this.clearDefault(tx, companyId);
            const [research] = await tx.insert(researchs).values({ ...fields, company_id: companyId }).returning();
            await tx.insert(researchAnswers).values(answers.map((title) => ({ research_id: research.id, title })));
            await this.linkQueues(tx, research.id, companyId, queueIds);
            return research;
        });
    }

    update(id: number, companyId: string, changes: ResearchChanges): Promise<boolean> {
        return this.db.transaction(async (tx) => {
            const [own] = await tx.select({ id: researchs.id }).from(researchs)
                .where(and(eq(researchs.id, id), eq(researchs.company_id, companyId)));
            if (!own) return false;

            if (changes.fields.default_research) await this.clearDefault(tx, companyId);
            await tx.update(researchs).set({ ...changes.fields, updated_at: new Date() }).where(eq(researchs.id, id));

            if (changes.answers) {
                const existing = await tx.select({ id: researchAnswers.id, title: researchAnswers.title })
                    .from(researchAnswers).where(eq(researchAnswers.research_id, id));
                const { removeIds, addTitles } = answerChanges(existing, changes.answers);
                if (removeIds.length > 0) await tx.delete(researchAnswers).where(inArray(researchAnswers.id, removeIds));
                if (addTitles.length > 0) await tx.insert(researchAnswers).values(addTitles.map((title) => ({ research_id: id, title })));
            }
            if (changes.queueIds) {
                await tx.delete(queueResearchs).where(eq(queueResearchs.research_id, id));
                await this.linkQueues(tx, id, companyId, changes.queueIds);
            }
            return true;
        });
    }

    async delete(id: number, companyId: string): Promise<boolean> {
        const [row] = await this.db.delete(researchs)
            .where(and(eq(researchs.id, id), eq(researchs.company_id, companyId)))
            .returning({ id: researchs.id });
        return !!row;
    }

    async findActiveForQueue(queueId: number, companyId: string): Promise<Research | null> {
        const [row] = await this.db.select({ research: researchs })
            .from(queueResearchs)
            .innerJoin(researchs, eq(researchs.id, queueResearchs.research_id))
            .where(and(eq(queueResearchs.queue_id, queueId), eq(researchs.company_id, companyId), eq(researchs.active, true)))
            .orderBy(desc(researchs.id))
            .limit(1);
        return row?.research ?? null;
    }

    answersOf(researchId: number): Promise<ResearchAnswer[]> {
        return this.db.select().from(researchAnswers)
            .where(eq(researchAnswers.research_id, researchId))
            .orderBy(asc(researchAnswers.id));
    }

    async createPending(entry: { company_id: string; ticket_id: number; research_id: number; contact_id: number }): Promise<void> {
        await this.db.insert(researchHistorics).values({ ...entry, answer_id: null, status: 'pending' });
    }

    async latestPending(companyId: string, contactId: number): Promise<ResearchHistoric | null> {
        const [row] = await this.db.select().from(researchHistorics)
            .where(and(
                eq(researchHistorics.company_id, companyId),
                eq(researchHistorics.contact_id, contactId),
                eq(researchHistorics.status, 'pending'),
            ))
            .orderBy(desc(researchHistorics.created_at), desc(researchHistorics.id))
            .limit(1);
        return row ?? null;
    }

    async markAnswered(historicId: number, answerId: number): Promise<void> {
        await this.db.update(researchHistorics)
            .set({ answer_id: answerId, status: 'answered', updated_at: new Date() })
            .where(eq(researchHistorics.id, historicId));
    }

    async answerTotals(companyId: string, period: ReportPeriod, attendantId?: string): Promise<AnswerTotal[]> {
        const conditions = this.answeredIn(companyId, period);
        let query = this.db
            .select({
                research_id:     researchs.id,
                research_name:   researchs.name,
                research_active: researchs.active,
                answer_id:       researchAnswers.id,
                answer_title:    researchAnswers.title,
                total:           sql<number>`cast(count(*) as int)`,
            })
            .from(researchHistorics)
            .innerJoin(researchs, eq(researchs.id, researchHistorics.research_id))
            .innerJoin(researchAnswers, eq(researchAnswers.id, researchHistorics.answer_id))
            .$dynamic();

        if (attendantId) {
            query = query.innerJoin(tickets, eq(tickets.id, researchHistorics.ticket_id)).$dynamic();
            conditions.push(eq(tickets.attendant_user_id, attendantId));
        }

        return query
            .where(and(...conditions))
            .groupBy(researchs.id, researchs.name, researchs.active, researchAnswers.id, researchAnswers.title)
            .orderBy(desc(researchs.id));
    }

    async answeredTickets(companyId: string, answerId: number, period: ReportPeriod, { limit, offset }: { limit: number; offset: number }) {
        const where = and(...this.answeredIn(companyId, period), eq(researchHistorics.answer_id, answerId));
        const [rows, [{ count }]] = await Promise.all([
            this.db.select({
                ticket_id:      tickets.id,
                answered_at:    researchHistorics.updated_at,
                contact_name:   contacts.name,
                contact_number: contacts.number,
                attendant_name: users.name,
            })
                .from(researchHistorics)
                .innerJoin(tickets, eq(tickets.id, researchHistorics.ticket_id))
                .innerJoin(contacts, eq(contacts.id, researchHistorics.contact_id))
                .leftJoin(users, eq(users.id, tickets.attendant_user_id))
                .where(where)
                .orderBy(desc(researchHistorics.updated_at))
                .limit(limit)
                .offset(offset),
            this.db.select({ count: sql<number>`cast(count(*) as int)` }).from(researchHistorics).where(where),
        ]);
        return { tickets: rows, total: count };
    }

    companyUsers(companyId: string): Promise<{ id: string; name: string }[]> {
        return this.db.select({ id: users.id, name: users.name }).from(users)
            .where(and(eq(users.company_id, companyId), eq(users.is_approved, true)))
            .orderBy(users.name);
    }

    /** Respostas da empresa dentro do período (fim do dia inclusivo). */
    private answeredIn(companyId: string, { dateInit, dateEnd }: ReportPeriod): SQL[] {
        const conditions: SQL[] = [eq(researchHistorics.company_id, companyId), eq(researchHistorics.status, 'answered')];
        if (dateInit) conditions.push(gte(researchHistorics.updated_at, new Date(dateInit)));
        if (dateEnd) conditions.push(lte(researchHistorics.updated_at, new Date(`${dateEnd}T23:59:59`)));
        return conditions;
    }

    private async clearDefault(tx: Tx, companyId: string) {
        await tx.update(researchs).set({ default_research: false }).where(eq(researchs.company_id, companyId));
    }

    /** Só filas da própria empresa podem receber a pesquisa. */
    private async linkQueues(tx: Tx, researchId: number, companyId: string, queueIds: number[]) {
        if (queueIds.length === 0) return;
        const owned = await tx.select({ id: queues.id }).from(queues)
            .where(and(eq(queues.company_id, companyId), inArray(queues.id, queueIds)));
        if (owned.length > 0) {
            await tx.insert(queueResearchs).values(owned.map((q) => ({ research_id: researchId, queue_id: q.id })));
        }
    }
}
