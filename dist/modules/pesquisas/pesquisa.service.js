"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.pesquisaService = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../database/client");
const pesquisa_db_schema_1 = require("./pesquisa.db.schema");
const atendimento_db_schema_1 = require("../atendimento/atendimento.db.schema");
const auth_schema_1 = require("../auth/auth.schema");
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
    // ── Envio após encerramento de ticket ────────────────────────────────────
    async sendSurveyAfterClose(ticket) {
        if (!ticket.queue_id)
            return;
        // Busca pesquisa associada à fila
        const [link] = await client_1.db
            .select({ research_id: pesquisa_db_schema_1.queueResearchs.research_id })
            .from(pesquisa_db_schema_1.queueResearchs)
            .where((0, drizzle_orm_1.eq)(pesquisa_db_schema_1.queueResearchs.queue_id, ticket.queue_id))
            .limit(1);
        if (!link)
            return;
        const [research] = await client_1.db
            .select()
            .from(pesquisa_db_schema_1.researchs)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchs.id, link.research_id), (0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchs.active, true)))
            .limit(1);
        if (!research)
            return;
        const answers = await client_1.db
            .select()
            .from(pesquisa_db_schema_1.researchAnswers)
            .where((0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchAnswers.research_id, research.id));
        if (answers.length === 0)
            return;
        // Busca número do contato
        const [contact] = await client_1.db
            .select({ number: atendimento_db_schema_1.contacts.number })
            .from(atendimento_db_schema_1.contacts)
            .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.id, ticket.contact_id))
            .limit(1);
        if (!contact?.number)
            return;
        // Monta mensagem com as opções numeradas
        const opcoes = answers.map((a, i) => `${i + 1}. ${a.title}`).join('\n');
        const mensagem = `${research.name}\n\n${opcoes}\n\nResponda com o número da sua opção.`;
        // Cria registro pendente
        await client_1.db.insert(pesquisa_db_schema_1.researchHistorics).values({
            company_id: ticket.company_id,
            ticket_id: ticket.id,
            research_id: research.id,
            contact_id: ticket.contact_id,
            answer_id: null,
            status: 'pending',
        });
        // Envia mensagem via WhatsApp
        const { whatsappService } = await Promise.resolve().then(() => __importStar(require('../whatsapp/whatsapp.service')));
        const connectionId = ticket.connection_id;
        if (connectionId) {
            whatsappService.sendTextToPhone(connectionId, contact.number, mensagem).catch((err) => console.error('[Survey] Falha ao enviar pesquisa:', err.message));
        }
        else {
            whatsappService.sendMessage(contact.number, mensagem).catch((err) => console.error('[Survey] Falha ao enviar pesquisa:', err.message));
        }
    },
    // ── Captura de resposta (mensagem recebida) ───────────────────────────────
    async tryRecordAnswer(companyId, contactId, messageBody) {
        // Busca a pesquisa pendente mais recente deste contato
        const [pending] = await client_1.db
            .select()
            .from(pesquisa_db_schema_1.researchHistorics)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchHistorics.company_id, companyId), (0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchHistorics.contact_id, contactId), (0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchHistorics.status, 'pending')))
            .orderBy((0, drizzle_orm_1.desc)(pesquisa_db_schema_1.researchHistorics.created_at))
            .limit(1);
        if (!pending)
            return false;
        const answers = await client_1.db
            .select()
            .from(pesquisa_db_schema_1.researchAnswers)
            .where((0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchAnswers.research_id, pending.research_id));
        if (answers.length === 0)
            return false;
        const text = messageBody.trim();
        const byNumber = /^\d+$/.test(text) ? answers[Number(text) - 1] : undefined;
        const byText = answers.find(a => a.title.toLowerCase() === text.toLowerCase());
        const matched = byNumber ?? byText;
        if (!matched)
            return false;
        await client_1.db.update(pesquisa_db_schema_1.researchHistorics)
            .set({ answer_id: matched.id, status: 'answered', updated_at: new Date() })
            .where((0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchHistorics.id, pending.id));
        return true;
    },
    // ── Relatório — resultados agregados ─────────────────────────────────────
    async getReport(companyId, params) {
        const { dateInit, dateEnd, userId } = params;
        const conditions = [
            (0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchHistorics.company_id, companyId),
            (0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchHistorics.status, 'answered'),
        ];
        if (dateInit)
            conditions.push((0, drizzle_orm_1.gte)(pesquisa_db_schema_1.researchHistorics.updated_at, new Date(dateInit)));
        if (dateEnd)
            conditions.push((0, drizzle_orm_1.lte)(pesquisa_db_schema_1.researchHistorics.updated_at, new Date(dateEnd + 'T23:59:59')));
        // Busca agregada: count por answer_id, com nome da pesquisa e da resposta
        let query = client_1.db
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
        if (userId) {
            query = query.innerJoin(atendimento_db_schema_1.tickets, (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.id, pesquisa_db_schema_1.researchHistorics.ticket_id))
                .$dynamic();
            conditions.push((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.attendant_user_id, userId));
        }
        const rows = await query
            .where((0, drizzle_orm_1.and)(...conditions))
            .groupBy(pesquisa_db_schema_1.researchs.id, pesquisa_db_schema_1.researchs.name, pesquisa_db_schema_1.researchs.active, pesquisa_db_schema_1.researchAnswers.id, pesquisa_db_schema_1.researchAnswers.title)
            .orderBy((0, drizzle_orm_1.desc)(pesquisa_db_schema_1.researchs.id));
        // Agrupa em JS por pesquisa
        const map = new Map();
        for (const row of rows) {
            if (!map.has(row.research_id)) {
                map.set(row.research_id, {
                    research_id: row.research_id,
                    research: row.research_name,
                    active: row.research_active,
                    total: 0,
                    answers: [],
                });
            }
            map.get(row.research_id).answers.push({ answerId: row.answer_id, answer: row.answer_title, total: row.total });
            map.get(row.research_id).total += row.total;
        }
        // Calcula percentuais
        const items = Array.from(map.values()).map(r => ({
            ...r,
            answers: r.answers.map((a) => ({
                ...a,
                percentage: r.total > 0 ? Math.round((a.total / r.total) * 100) + '%' : '0%',
            })),
        }));
        // Atendentes da empresa para o seletor de filtro
        const company_users = await client_1.db
            .select({ id: auth_schema_1.users.id, name: auth_schema_1.users.name })
            .from(auth_schema_1.users)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(auth_schema_1.users.company_id, companyId), (0, drizzle_orm_1.eq)(auth_schema_1.users.is_approved, true)))
            .orderBy(auth_schema_1.users.name);
        return { items, total: items.length, company_users };
    },
    // ── Relatório — drill-down: tickets de uma resposta ──────────────────────
    async getReportDrillDown(companyId, params) {
        const { answerId, dateInit, dateEnd, limit = 50, offset = 0 } = params;
        const conditions = [
            (0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchHistorics.company_id, companyId),
            (0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchHistorics.answer_id, answerId),
            (0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchHistorics.status, 'answered'),
        ];
        if (dateInit)
            conditions.push((0, drizzle_orm_1.gte)(pesquisa_db_schema_1.researchHistorics.updated_at, new Date(dateInit)));
        if (dateEnd)
            conditions.push((0, drizzle_orm_1.lte)(pesquisa_db_schema_1.researchHistorics.updated_at, new Date(dateEnd + 'T23:59:59')));
        const where = (0, drizzle_orm_1.and)(...conditions);
        const [rows, countRows] = await Promise.all([
            client_1.db
                .select({
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
            client_1.db
                .select({ count: (0, drizzle_orm_1.sql) `cast(count(*) as int)` })
                .from(pesquisa_db_schema_1.researchHistorics)
                .where(where),
        ]);
        return { tickets: rows, total: countRows[0]?.count ?? 0 };
    },
};
//# sourceMappingURL=pesquisa.service.js.map