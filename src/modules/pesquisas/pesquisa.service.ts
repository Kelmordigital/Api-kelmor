import { NotFoundError } from '../../core/errors/http-errors';
import type { Research } from './pesquisa.db.schema';
import type { ResearchChanges, ResearchRepository, ResearchWithDetails } from './pesquisa.repository';
import type { CreateResearchInput, ReportQuery, ReportViewQuery, UpdateResearchInput } from './pesquisa.dto';
import { SurveyQuestion } from './survey-question';

const DEFAULT_TYPE = 'satisfaction';

/** Cadastro das pesquisas da empresa (admin). */
export class ResearchCatalogService {
    constructor(private readonly repository: ResearchRepository) {}

    list(companyId: string): Promise<ResearchWithDetails[]> {
        return this.repository.listWithDetails(companyId);
    }

    listActive(companyId: string): Promise<Research[]> {
        return this.repository.listActive(companyId);
    }

    create(companyId: string, input: CreateResearchInput): Promise<Research> {
        return this.repository.create(companyId, {
            name:             input.name,
            type:             input.type ?? DEFAULT_TYPE,
            active:           input.active ?? true,
            default_research: input.default_research ?? false,
        }, input.answers, input.queue_ids ?? []);
    }

    async update(id: number, companyId: string, input: UpdateResearchInput): Promise<void> {
        const { answers, queue_ids, ...rest } = input;
        const changes: ResearchChanges = {
            fields: Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)),
            answers,
            queueIds: queue_ids,
        };
        if (!(await this.repository.update(id, companyId, changes))) throw ResearchCatalogService.notFound();
    }

    async remove(id: number, companyId: string): Promise<void> {
        if (!(await this.repository.delete(id, companyId))) throw ResearchCatalogService.notFound();
    }

    private static notFound() {
        return new NotFoundError('Pesquisa não encontrada');
    }
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
export class SurveyFlowService implements ResearchSurvey {
    constructor(
        private readonly repository: ResearchRepository,
        private readonly channel: SurveyChannel,
        private readonly tickets: ResearchTicketCloser,
    ) {}

    async findActiveForQueue(queueId: number | null, companyId: string): Promise<Research | null> {
        if (!queueId) return null;
        return this.repository.findActiveForQueue(queueId, companyId);
    }

    async sendSurveyQuestion(ticket: SurveyTicket, research: Research): Promise<void> {
        const question = new SurveyQuestion(research.name, await this.repository.answersOf(research.id));
        if (!question.hasOptions) return;

        const target = await this.channel.targetFor(ticket.contact_id);
        if (!target) return;

        await this.repository.createPending({
            company_id: ticket.company_id, ticket_id: ticket.id, research_id: research.id, contact_id: ticket.contact_id,
        });
        await this.channel.send(ticket, target, question.message());
    }

    /** true se a mensagem respondeu a pesquisa pendente mais recente do contato. */
    async tryRecordAnswer(companyId: string, contactId: number, messageBody: string): Promise<boolean> {
        const pending = await this.repository.latestPending(companyId, contactId);
        if (!pending) return false;

        const answer = new SurveyQuestion('', await this.repository.answersOf(pending.research_id)).answerFor(messageBody);
        if (!answer) return false;

        await this.repository.markAnswered(pending.id, answer.id);
        // Pesquisa respondida = fechamento com pesquisa concluído (status 7 → 3)
        await this.tickets.finalizeAfterResearch(pending.ticket_id, companyId).catch((err: unknown) =>
            console.error(`[Survey] Falha ao fechar ticket ${pending.ticket_id} após resposta:`, err instanceof Error ? err.message : err),
        );
        return true;
    }
}

export interface ResearchReportItem {
    research_id: number;
    research: string;
    active: boolean;
    total: number;
    answers: { answerId: number; answer: string; total: number; percentage: string }[];
}

/** Relatório de respostas (admin). */
export class ResearchReportService {
    constructor(private readonly repository: ResearchRepository) {}

    async report(companyId: string, query: ReportQuery) {
        const rows = await this.repository.answerTotals(companyId, query, query.userId);

        const byResearch = new Map<number, ResearchReportItem>();
        for (const row of rows) {
            const item = byResearch.get(row.research_id)
                ?? { research_id: row.research_id, research: row.research_name, active: row.research_active, total: 0, answers: [] };
            item.answers.push({ answerId: row.answer_id, answer: row.answer_title, total: row.total, percentage: '' });
            item.total += row.total;
            byResearch.set(row.research_id, item);
        }
        const items = [...byResearch.values()].map((item) => ({
            ...item,
            answers: item.answers.map((a) => ({ ...a, percentage: ResearchReportService.percentage(a.total, item.total) })),
        }));

        return { items, total: items.length, company_users: await this.repository.companyUsers(companyId) };
    }

    drillDown(companyId: string, query: ReportViewQuery) {
        return this.repository.answeredTickets(companyId, query.answerId, query, {
            limit: query.limit ?? 50,
            offset: query.offset ?? 0,
        });
    }

    private static percentage(part: number, total: number): string {
        return total > 0 ? `${Math.round((part / total) * 100)}%` : '0%';
    }
}
