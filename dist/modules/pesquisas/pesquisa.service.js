"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResearchReportService = exports.SurveyFlowService = exports.ResearchCatalogService = void 0;
const http_errors_1 = require("../../core/errors/http-errors");
const survey_question_1 = require("./survey-question");
const DEFAULT_TYPE = 'satisfaction';
/** Cadastro das pesquisas da empresa (admin). */
class ResearchCatalogService {
    repository;
    constructor(repository) {
        this.repository = repository;
    }
    list(companyId) {
        return this.repository.listWithDetails(companyId);
    }
    listActive(companyId) {
        return this.repository.listActive(companyId);
    }
    create(companyId, input) {
        return this.repository.create(companyId, {
            name: input.name,
            type: input.type ?? DEFAULT_TYPE,
            active: input.active ?? true,
            default_research: input.default_research ?? false,
        }, input.answers, input.queue_ids ?? []);
    }
    async update(id, companyId, input) {
        const { answers, queue_ids, ...rest } = input;
        const changes = {
            fields: Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)),
            answers,
            queueIds: queue_ids,
        };
        if (!(await this.repository.update(id, companyId, changes)))
            throw ResearchCatalogService.notFound();
    }
    async remove(id, companyId) {
        if (!(await this.repository.delete(id, companyId)))
            throw ResearchCatalogService.notFound();
    }
    static notFound() {
        return new http_errors_1.NotFoundError('Pesquisa não encontrada');
    }
}
exports.ResearchCatalogService = ResearchCatalogService;
/**
 * Fechamento com pesquisa: em vez da despedida, o cliente recebe a pergunta;
 * a resposta dele é registrada e só então o ticket fecha de verdade.
 */
class SurveyFlowService {
    repository;
    channel;
    tickets;
    constructor(repository, channel, tickets) {
        this.repository = repository;
        this.channel = channel;
        this.tickets = tickets;
    }
    async findActiveForQueue(queueId, companyId) {
        if (!queueId)
            return null;
        return this.repository.findActiveForQueue(queueId, companyId);
    }
    async sendSurveyQuestion(ticket, research) {
        const question = new survey_question_1.SurveyQuestion(research.name, await this.repository.answersOf(research.id));
        if (!question.hasOptions)
            return;
        const target = await this.channel.targetFor(ticket.contact_id);
        if (!target)
            return;
        await this.repository.createPending({
            company_id: ticket.company_id, ticket_id: ticket.id, research_id: research.id, contact_id: ticket.contact_id,
        });
        await this.channel.send(ticket, target, question.message());
    }
    /** true se a mensagem respondeu a pesquisa pendente mais recente do contato. */
    async tryRecordAnswer(companyId, contactId, messageBody) {
        const pending = await this.repository.latestPending(companyId, contactId);
        if (!pending)
            return false;
        const answer = new survey_question_1.SurveyQuestion('', await this.repository.answersOf(pending.research_id)).answerFor(messageBody);
        if (!answer)
            return false;
        await this.repository.markAnswered(pending.id, answer.id);
        // Pesquisa respondida = fechamento com pesquisa concluído (status 7 → 3)
        await this.tickets.finalizeAfterResearch(pending.ticket_id, companyId).catch((err) => console.error(`[Survey] Falha ao fechar ticket ${pending.ticket_id} após resposta:`, err instanceof Error ? err.message : err));
        return true;
    }
}
exports.SurveyFlowService = SurveyFlowService;
/** Relatório de respostas (admin). */
class ResearchReportService {
    repository;
    constructor(repository) {
        this.repository = repository;
    }
    async report(companyId, query) {
        const rows = await this.repository.answerTotals(companyId, query, query.userId);
        const byResearch = new Map();
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
    drillDown(companyId, query) {
        return this.repository.answeredTickets(companyId, query.answerId, query, {
            limit: query.limit ?? 50,
            offset: query.offset ?? 0,
        });
    }
    static percentage(part, total) {
        return total > 0 ? `${Math.round((part / total) * 100)}%` : '0%';
    }
}
exports.ResearchReportService = ResearchReportService;
//# sourceMappingURL=pesquisa.service.js.map