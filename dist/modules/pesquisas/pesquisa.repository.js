"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DrizzleResearchRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const pesquisa_db_schema_1 = require("./pesquisa.db.schema");
const atendimento_db_schema_1 = require("../atendimento/atendimento.db.schema");
const auth_schema_1 = require("../auth/auth.schema");
const survey_question_1 = require("./survey-question");
class DrizzleResearchRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async listWithDetails(companyId) {
        const list = await this.db.select().from(pesquisa_db_schema_1.researchs).where((0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchs.company_id, companyId));
        if (list.length === 0)
            return [];
        const ids = list.map((r) => r.id);
        const [answers, links] = await Promise.all([
            this.db.select().from(pesquisa_db_schema_1.researchAnswers).where((0, drizzle_orm_1.inArray)(pesquisa_db_schema_1.researchAnswers.research_id, ids)).orderBy((0, drizzle_orm_1.asc)(pesquisa_db_schema_1.researchAnswers.id)),
            this.db.select({ research_id: pesquisa_db_schema_1.queueResearchs.research_id, queue_id: pesquisa_db_schema_1.queueResearchs.queue_id, name: atendimento_db_schema_1.queues.name, color: atendimento_db_schema_1.queues.color })
                .from(pesquisa_db_schema_1.queueResearchs)
                .innerJoin(atendimento_db_schema_1.queues, (0, drizzle_orm_1.eq)(pesquisa_db_schema_1.queueResearchs.queue_id, atendimento_db_schema_1.queues.id))
                .where((0, drizzle_orm_1.inArray)(pesquisa_db_schema_1.queueResearchs.research_id, ids)),
        ]);
        return list.map((r) => ({
            ...r,
            answers: answers.filter((a) => a.research_id === r.id),
            queues: links.filter((q) => q.research_id === r.id),
        }));
    }
    listActive(companyId) {
        return this.db.select().from(pesquisa_db_schema_1.researchs)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchs.company_id, companyId), (0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchs.active, true)));
    }
    create(companyId, fields, answers, queueIds) {
        return this.db.transaction(async (tx) => {
            if (fields.default_research)
                await this.clearDefault(tx, companyId);
            const [research] = await tx.insert(pesquisa_db_schema_1.researchs).values({ ...fields, company_id: companyId }).returning();
            await tx.insert(pesquisa_db_schema_1.researchAnswers).values(answers.map((title) => ({ research_id: research.id, title })));
            await this.linkQueues(tx, research.id, companyId, queueIds);
            return research;
        });
    }
    update(id, companyId, changes) {
        return this.db.transaction(async (tx) => {
            const [own] = await tx.select({ id: pesquisa_db_schema_1.researchs.id }).from(pesquisa_db_schema_1.researchs)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchs.id, id), (0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchs.company_id, companyId)));
            if (!own)
                return false;
            if (changes.fields.default_research)
                await this.clearDefault(tx, companyId);
            await tx.update(pesquisa_db_schema_1.researchs).set({ ...changes.fields, updated_at: new Date() }).where((0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchs.id, id));
            if (changes.answers) {
                const existing = await tx.select({ id: pesquisa_db_schema_1.researchAnswers.id, title: pesquisa_db_schema_1.researchAnswers.title })
                    .from(pesquisa_db_schema_1.researchAnswers).where((0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchAnswers.research_id, id));
                const { removeIds, addTitles } = (0, survey_question_1.answerChanges)(existing, changes.answers);
                if (removeIds.length > 0)
                    await tx.delete(pesquisa_db_schema_1.researchAnswers).where((0, drizzle_orm_1.inArray)(pesquisa_db_schema_1.researchAnswers.id, removeIds));
                if (addTitles.length > 0)
                    await tx.insert(pesquisa_db_schema_1.researchAnswers).values(addTitles.map((title) => ({ research_id: id, title })));
            }
            if (changes.queueIds) {
                await tx.delete(pesquisa_db_schema_1.queueResearchs).where((0, drizzle_orm_1.eq)(pesquisa_db_schema_1.queueResearchs.research_id, id));
                await this.linkQueues(tx, id, companyId, changes.queueIds);
            }
            return true;
        });
    }
    async delete(id, companyId) {
        const [row] = await this.db.delete(pesquisa_db_schema_1.researchs)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchs.id, id), (0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchs.company_id, companyId)))
            .returning({ id: pesquisa_db_schema_1.researchs.id });
        return !!row;
    }
    async findActiveForQueue(queueId, companyId) {
        const [row] = await this.db.select({ research: pesquisa_db_schema_1.researchs })
            .from(pesquisa_db_schema_1.queueResearchs)
            .innerJoin(pesquisa_db_schema_1.researchs, (0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchs.id, pesquisa_db_schema_1.queueResearchs.research_id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pesquisa_db_schema_1.queueResearchs.queue_id, queueId), (0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchs.company_id, companyId), (0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchs.active, true)))
            .orderBy((0, drizzle_orm_1.desc)(pesquisa_db_schema_1.researchs.id))
            .limit(1);
        return row?.research ?? null;
    }
    answersOf(researchId) {
        return this.db.select().from(pesquisa_db_schema_1.researchAnswers)
            .where((0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchAnswers.research_id, researchId))
            .orderBy((0, drizzle_orm_1.asc)(pesquisa_db_schema_1.researchAnswers.id));
    }
    async createPending(entry) {
        await this.db.insert(pesquisa_db_schema_1.researchHistorics).values({ ...entry, answer_id: null, status: 'pending' });
    }
    async latestPending(companyId, contactId) {
        const [row] = await this.db.select().from(pesquisa_db_schema_1.researchHistorics)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchHistorics.company_id, companyId), (0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchHistorics.contact_id, contactId), (0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchHistorics.status, 'pending')))
            .orderBy((0, drizzle_orm_1.desc)(pesquisa_db_schema_1.researchHistorics.created_at), (0, drizzle_orm_1.desc)(pesquisa_db_schema_1.researchHistorics.id))
            .limit(1);
        return row ?? null;
    }
    async markAnswered(historicId, answerId) {
        await this.db.update(pesquisa_db_schema_1.researchHistorics)
            .set({ answer_id: answerId, status: 'answered', updated_at: new Date() })
            .where((0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchHistorics.id, historicId));
    }
    async answerTotals(companyId, period, attendantId) {
        const conditions = this.answeredIn(companyId, period);
        let query = this.db
            .select({
            research_id: pesquisa_db_schema_1.researchs.id,
            research_name: pesquisa_db_schema_1.researchs.name,
            research_active: pesquisa_db_schema_1.researchs.active,
            answer_id: pesquisa_db_schema_1.researchAnswers.id,
            answer_title: pesquisa_db_schema_1.researchAnswers.title,
            total: (0, drizzle_orm_1.sql) `cast(count(*) as int)`,
        })
            .from(pesquisa_db_schema_1.researchHistorics)
            .innerJoin(pesquisa_db_schema_1.researchs, (0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchs.id, pesquisa_db_schema_1.researchHistorics.research_id))
            .innerJoin(pesquisa_db_schema_1.researchAnswers, (0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchAnswers.id, pesquisa_db_schema_1.researchHistorics.answer_id))
            .$dynamic();
        if (attendantId) {
            query = query.innerJoin(atendimento_db_schema_1.tickets, (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.id, pesquisa_db_schema_1.researchHistorics.ticket_id)).$dynamic();
            conditions.push((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.attendant_user_id, attendantId));
        }
        return query
            .where((0, drizzle_orm_1.and)(...conditions))
            .groupBy(pesquisa_db_schema_1.researchs.id, pesquisa_db_schema_1.researchs.name, pesquisa_db_schema_1.researchs.active, pesquisa_db_schema_1.researchAnswers.id, pesquisa_db_schema_1.researchAnswers.title)
            .orderBy((0, drizzle_orm_1.desc)(pesquisa_db_schema_1.researchs.id));
    }
    async answeredTickets(companyId, answerId, period, { limit, offset }) {
        const where = (0, drizzle_orm_1.and)(...this.answeredIn(companyId, period), (0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchHistorics.answer_id, answerId));
        const [rows, [{ count }]] = await Promise.all([
            this.db.select({
                ticket_id: atendimento_db_schema_1.tickets.id,
                answered_at: pesquisa_db_schema_1.researchHistorics.updated_at,
                contact_name: atendimento_db_schema_1.contacts.name,
                contact_number: atendimento_db_schema_1.contacts.number,
                attendant_name: auth_schema_1.users.name,
            })
                .from(pesquisa_db_schema_1.researchHistorics)
                .innerJoin(atendimento_db_schema_1.tickets, (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.id, pesquisa_db_schema_1.researchHistorics.ticket_id))
                .innerJoin(atendimento_db_schema_1.contacts, (0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.id, pesquisa_db_schema_1.researchHistorics.contact_id))
                .leftJoin(auth_schema_1.users, (0, drizzle_orm_1.eq)(auth_schema_1.users.id, atendimento_db_schema_1.tickets.attendant_user_id))
                .where(where)
                .orderBy((0, drizzle_orm_1.desc)(pesquisa_db_schema_1.researchHistorics.updated_at))
                .limit(limit)
                .offset(offset),
            this.db.select({ count: (0, drizzle_orm_1.sql) `cast(count(*) as int)` }).from(pesquisa_db_schema_1.researchHistorics).where(where),
        ]);
        return { tickets: rows, total: count };
    }
    companyUsers(companyId) {
        return this.db.select({ id: auth_schema_1.users.id, name: auth_schema_1.users.name }).from(auth_schema_1.users)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(auth_schema_1.users.company_id, companyId), (0, drizzle_orm_1.eq)(auth_schema_1.users.is_approved, true)))
            .orderBy(auth_schema_1.users.name);
    }
    /** Respostas da empresa dentro do período (fim do dia inclusivo). */
    answeredIn(companyId, { dateInit, dateEnd }) {
        const conditions = [(0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchHistorics.company_id, companyId), (0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchHistorics.status, 'answered')];
        if (dateInit)
            conditions.push((0, drizzle_orm_1.gte)(pesquisa_db_schema_1.researchHistorics.updated_at, new Date(dateInit)));
        if (dateEnd)
            conditions.push((0, drizzle_orm_1.lte)(pesquisa_db_schema_1.researchHistorics.updated_at, new Date(`${dateEnd}T23:59:59`)));
        return conditions;
    }
    async clearDefault(tx, companyId) {
        await tx.update(pesquisa_db_schema_1.researchs).set({ default_research: false }).where((0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchs.company_id, companyId));
    }
    /** Só filas da própria empresa podem receber a pesquisa. */
    async linkQueues(tx, researchId, companyId, queueIds) {
        if (queueIds.length === 0)
            return;
        const owned = await tx.select({ id: atendimento_db_schema_1.queues.id }).from(atendimento_db_schema_1.queues)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.queues.company_id, companyId), (0, drizzle_orm_1.inArray)(atendimento_db_schema_1.queues.id, queueIds)));
        if (owned.length > 0) {
            await tx.insert(pesquisa_db_schema_1.queueResearchs).values(owned.map((q) => ({ research_id: researchId, queue_id: q.id })));
        }
    }
}
exports.DrizzleResearchRepository = DrizzleResearchRepository;
//# sourceMappingURL=pesquisa.repository.js.map