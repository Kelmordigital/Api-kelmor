import type { DB } from '../../database/client';
import { Research, ResearchAnswer, ResearchHistoric } from './pesquisa.db.schema';
export interface ResearchWithDetails extends Research {
    answers: ResearchAnswer[];
    queues: {
        research_id: number;
        queue_id: number;
        name: string;
        color: string | null;
    }[];
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
    createPending(entry: {
        company_id: string;
        ticket_id: number;
        research_id: number;
        contact_id: number;
    }): Promise<void>;
    latestPending(companyId: string, contactId: number): Promise<ResearchHistoric | null>;
    markAnswered(historicId: number, answerId: number): Promise<void>;
    answerTotals(companyId: string, period: ReportPeriod, attendantId?: string): Promise<AnswerTotal[]>;
    answeredTickets(companyId: string, answerId: number, period: ReportPeriod, page: {
        limit: number;
        offset: number;
    }): Promise<{
        tickets: AnsweredTicket[];
        total: number;
    }>;
    companyUsers(companyId: string): Promise<{
        id: string;
        name: string;
    }[]>;
}
export declare class DrizzleResearchRepository implements ResearchRepository {
    private readonly db;
    constructor(db: DB);
    listWithDetails(companyId: string): Promise<ResearchWithDetails[]>;
    listActive(companyId: string): Promise<Research[]>;
    create(companyId: string, fields: ResearchFields, answers: string[], queueIds: number[]): Promise<Research>;
    update(id: number, companyId: string, changes: ResearchChanges): Promise<boolean>;
    delete(id: number, companyId: string): Promise<boolean>;
    findActiveForQueue(queueId: number, companyId: string): Promise<Research | null>;
    answersOf(researchId: number): Promise<ResearchAnswer[]>;
    createPending(entry: {
        company_id: string;
        ticket_id: number;
        research_id: number;
        contact_id: number;
    }): Promise<void>;
    latestPending(companyId: string, contactId: number): Promise<ResearchHistoric | null>;
    markAnswered(historicId: number, answerId: number): Promise<void>;
    answerTotals(companyId: string, period: ReportPeriod, attendantId?: string): Promise<AnswerTotal[]>;
    answeredTickets(companyId: string, answerId: number, period: ReportPeriod, { limit, offset }: {
        limit: number;
        offset: number;
    }): Promise<{
        tickets: {
            ticket_id: number;
            answered_at: Date | null;
            contact_name: string;
            contact_number: string | null;
            attendant_name: string | null;
        }[];
        total: number;
    }>;
    companyUsers(companyId: string): Promise<{
        id: string;
        name: string;
    }[]>;
    /** Respostas da empresa dentro do período (fim do dia inclusivo). */
    private answeredIn;
    private clearDefault;
    /** Só filas da própria empresa podem receber a pesquisa. */
    private linkQueues;
}
//# sourceMappingURL=pesquisa.repository.d.ts.map