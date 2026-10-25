import type { Research } from './pesquisa.db.schema';
import type { ResearchRepository, ResearchWithDetails } from './pesquisa.repository';
import type { CreateResearchInput, ReportQuery, ReportViewQuery, UpdateResearchInput } from './pesquisa.dto';
/** Cadastro das pesquisas da empresa (admin). */
export declare class ResearchCatalogService {
    private readonly repository;
    constructor(repository: ResearchRepository);
    list(companyId: string): Promise<ResearchWithDetails[]>;
    listActive(companyId: string): Promise<Research[]>;
    create(companyId: string, input: CreateResearchInput): Promise<Research>;
    update(id: number, companyId: string, input: UpdateResearchInput): Promise<void>;
    remove(id: number, companyId: string): Promise<void>;
    private static notFound;
}
export interface SurveyTicket {
    id: number;
    company_id: string;
    contact_id: number;
    connection_id: number | null;
}
/** Como a pergunta chega ao cliente (registro no atendimento + WhatsApp). */
export interface SurveyChannel {
    /** Número/LID do contato para o WhatsApp; null se não houver como enviar. */
    targetFor(contactId: number): Promise<string | null>;
    send(ticket: SurveyTicket, target: string, text: string): Promise<void>;
}
/** Fecha o ticket que estava aguardando a resposta da pesquisa. */
export interface ResearchTicketCloser {
    finalizeAfterResearch(ticketId: number, companyId: string): Promise<void>;
}
/** O que o atendimento e os webhooks do WhatsApp precisam da pesquisa (ISP). */
export interface ResearchSurvey {
    findActiveForQueue(queueId: number | null, companyId: string): Promise<Research | null>;
    sendSurveyQuestion(ticket: SurveyTicket, research: Research): Promise<void>;
    tryRecordAnswer(companyId: string, contactId: number, messageBody: string): Promise<boolean>;
}
/**
 * Fechamento com pesquisa: em vez da despedida, o cliente recebe a pergunta;
 * a resposta dele é registrada e só então o ticket fecha de verdade.
 */
export declare class SurveyFlowService implements ResearchSurvey {
    private readonly repository;
    private readonly channel;
    private readonly tickets;
    constructor(repository: ResearchRepository, channel: SurveyChannel, tickets: ResearchTicketCloser);
    findActiveForQueue(queueId: number | null, companyId: string): Promise<Research | null>;
    sendSurveyQuestion(ticket: SurveyTicket, research: Research): Promise<void>;
    /** true se a mensagem respondeu a pesquisa pendente mais recente do contato. */
    tryRecordAnswer(companyId: string, contactId: number, messageBody: string): Promise<boolean>;
}
export interface ResearchReportItem {
    research_id: number;
    research: string;
    active: boolean;
    total: number;
    answers: {
        answerId: number;
        answer: string;
        total: number;
        percentage: string;
    }[];
}
/** Relatório de respostas (admin). */
export declare class ResearchReportService {
    private readonly repository;
    constructor(repository: ResearchRepository);
    report(companyId: string, query: ReportQuery): Promise<{
        items: {
            answers: {
                percentage: string;
                answerId: number;
                answer: string;
                total: number;
            }[];
            research_id: number;
            research: string;
            active: boolean;
            total: number;
        }[];
        total: number;
        company_users: {
            id: string;
            name: string;
        }[];
    }>;
    drillDown(companyId: string, query: ReportViewQuery): Promise<{
        tickets: import("./pesquisa.repository").AnsweredTicket[];
        total: number;
    }>;
    private static percentage;
}
//# sourceMappingURL=pesquisa.service.d.ts.map