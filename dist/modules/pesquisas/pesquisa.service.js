"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pesquisaService = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../database/client");
const pesquisa_db_schema_1 = require("./pesquisa.db.schema");
const atendimento_db_schema_1 = require("../atendimento/atendimento.db.schema");
exports.pesquisaService = {
    async list(companyId) {
        const list = await client_1.db
            .select()
            .from(pesquisa_db_schema_1.researchs)
            .where((0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchs.company_id, companyId));
        if (list.length === 0)
            return [];
        const ids = list.map((r) => r.id);
        const [answers, queueLinks] = await Promise.all([
            client_1.db.select().from(pesquisa_db_schema_1.researchAnswers).where((0, drizzle_orm_1.inArray)(pesquisa_db_schema_1.researchAnswers.research_id, ids)),
            client_1.db.select({ research_id: pesquisa_db_schema_1.queueResearchs.research_id, queue_id: pesquisa_db_schema_1.queueResearchs.queue_id, name: atendimento_db_schema_1.queues.name, color: atendimento_db_schema_1.queues.color })
                .from(pesquisa_db_schema_1.queueResearchs)
                .innerJoin(atendimento_db_schema_1.queues, (0, drizzle_orm_1.eq)(pesquisa_db_schema_1.queueResearchs.queue_id, atendimento_db_schema_1.queues.id))
                .where((0, drizzle_orm_1.inArray)(pesquisa_db_schema_1.queueResearchs.research_id, ids)),
        ]);
        return list.map((r) => ({
            ...r,
            answers: answers.filter((a) => a.research_id === r.id),
            queues: queueLinks.filter((q) => q.research_id === r.id),
        }));
    },
    async listActive(companyId) {
        return client_1.db
            .select()
            .from(pesquisa_db_schema_1.researchs)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchs.company_id, companyId), (0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchs.active, true)));
    },
    async create(companyId, payload) {
        // Se vai ser default, remove o default das outras
        if (payload.default_research) {
            await client_1.db.update(pesquisa_db_schema_1.researchs)
                .set({ default_research: false })
                .where((0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchs.company_id, companyId));
        }
        const [research] = await client_1.db.insert(pesquisa_db_schema_1.researchs).values({
            company_id: companyId,
            name: payload.name,
            type: payload.type ?? 'satisfaction',
            active: payload.active ?? true,
            default_research: payload.default_research ?? false,
        }).returning();
        if (payload.answers.length > 0) {
            await client_1.db.insert(pesquisa_db_schema_1.researchAnswers).values(payload.answers.map((title) => ({ research_id: research.id, title })));
        }
        if (payload.queue_ids?.length) {
            await client_1.db.insert(pesquisa_db_schema_1.queueResearchs).values(payload.queue_ids.map((qid) => ({ research_id: research.id, queue_id: qid })));
        }
        return research;
    },
    async update(id, companyId, payload) {
        if (payload.default_research) {
            await client_1.db.update(pesquisa_db_schema_1.researchs)
                .set({ default_research: false })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchs.company_id, companyId), (0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchs.id, id)));
            await client_1.db.update(pesquisa_db_schema_1.researchs)
                .set({ default_research: false })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchs.company_id, companyId)));
        }
        const updateData = { updated_at: new Date() };
        if (payload.name !== undefined)
            updateData.name = payload.name;
        if (payload.type !== undefined)
            updateData.type = payload.type;
        if (payload.active !== undefined)
            updateData.active = payload.active;
        if (payload.default_research !== undefined)
            updateData.default_research = payload.default_research;
        await client_1.db.update(pesquisa_db_schema_1.researchs)
            .set(updateData)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchs.id, id), (0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchs.company_id, companyId)));
        if (payload.answers !== undefined) {
            await client_1.db.delete(pesquisa_db_schema_1.researchAnswers).where((0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchAnswers.research_id, id));
            if (payload.answers.length > 0) {
                await client_1.db.insert(pesquisa_db_schema_1.researchAnswers).values(payload.answers.map((title) => ({ research_id: id, title })));
            }
        }
        if (payload.queue_ids !== undefined) {
            await client_1.db.delete(pesquisa_db_schema_1.queueResearchs).where((0, drizzle_orm_1.eq)(pesquisa_db_schema_1.queueResearchs.research_id, id));
            if (payload.queue_ids.length > 0) {
                await client_1.db.insert(pesquisa_db_schema_1.queueResearchs).values(payload.queue_ids.map((qid) => ({ research_id: id, queue_id: qid })));
            }
        }
        return { id };
    },
    async remove(id, companyId) {
        const [row] = await client_1.db
            .delete(pesquisa_db_schema_1.researchs)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchs.id, id), (0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchs.company_id, companyId)))
            .returning({ id: pesquisa_db_schema_1.researchs.id });
        return !!row;
    },
};
//# sourceMappingURL=pesquisa.service.js.map