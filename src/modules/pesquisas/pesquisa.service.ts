import { eq, and, inArray, gte, lte, desc, sql, isNull } from 'drizzle-orm';
import { db } from '../../database/client';
import { researchs, researchAnswers, queueResearchs, researchHistorics } from './pesquisa.db.schema';
import { queues, tickets, contacts } from '../atendimento/atendimento.db.schema';
import { users } from '../auth/auth.schema';

export const pesquisaService = {

    async list(companyId: string) {
        const list = await db
            .select()
            .from(researchs)
            .where(eq(researchs.company_id, companyId));

        if (list.length === 0) return [];

        const ids = list.map((r) => r.id);
        const [answers, queueLinks] = await Promise.all([
            db.select().from(researchAnswers).where(inArray(researchAnswers.research_id, ids)),
            db.select({ research_id: queueResearchs.research_id, queue_id: queueResearchs.queue_id, name: queues.name, color: queues.color })
                .from(queueResearchs)
                .innerJoin(queues, eq(queueResearchs.queue_id, queues.id))
                .where(inArray(queueResearchs.research_id, ids)),
        ]);

        return list.map((r) => ({
            ...r,
            answers: answers.filter((a) => a.research_id === r.id),
            queues: queueLinks.filter((q) => q.research_id === r.id),
        }));
    },

    async listActive(companyId: string) {
        return db
            .select()
            .from(researchs)
            .where(and(eq(researchs.company_id, companyId), eq(researchs.active, true)));
    },

    async create(companyId: string, payload: {
        name: string;
        type?: string;
        active?: boolean;
        default_research?: boolean;
        answers: string[];
        queue_ids?: number[];
    }) {
        // Se vai ser default, remove o default das outras
        if (payload.default_research) {
            await db.update(researchs)
                .set({ default_research: false })
                .where(eq(researchs.company_id, companyId));
        }

        const [research] = await db.insert(researchs).values({
            company_id: companyId,
            name: payload.name,
            type: payload.type ?? 'satisfaction',
            active: payload.active ?? true,
            default_research: payload.default_research ?? false,
        }).returning();

        if (payload.answers.length > 0) {
            await db.insert(researchAnswers).values(
                payload.answers.map((title) => ({ research_id: research.id, title }))
            );
        }

        if (payload.queue_ids?.length) {
            await db.insert(queueResearchs).values(
                payload.queue_ids.map((qid) => ({ research_id: research.id, queue_id: qid }))
            );
        }

        return research;
    },

    async update(id: number, companyId: string, payload: {
        name?: string;
        type?: string;
        active?: boolean;
        default_research?: boolean;
        answers?: string[];
        queue_ids?: number[];
    }) {
        if (payload.default_research) {
            await db.update(researchs)
                .set({ default_research: false })
                .where(and(eq(researchs.company_id, companyId), eq(researchs.id, id)));
            await db.update(researchs)
                .set({ default_research: false })
                .where(and(eq(researchs.company_id, companyId)));
        }

        const updateData: Record<string, unknown> = { updated_at: new Date() };
        if (payload.name !== undefined) updateData.name = payload.name;
        if (payload.type !== undefined) updateData.type = payload.type;
        if (payload.active !== undefined) updateData.active = payload.active;
        if (payload.default_research !== undefined) updateData.default_research = payload.default_research;

        await db.update(researchs)
            .set(updateData)
            .where(and(eq(researchs.id, id), eq(researchs.company_id, companyId)));

        if (payload.answers !== undefined) {
            await db.delete(researchAnswers).where(eq(researchAnswers.research_id, id));
            if (payload.answers.length > 0) {
                await db.insert(researchAnswers).values(
                    payload.answers.map((title) => ({ research_id: id, title }))
                );
            }
        }

        if (payload.queue_ids !== undefined) {
            await db.delete(queueResearchs).where(eq(queueResearchs.research_id, id));
            if (payload.queue_ids.length > 0) {
                await db.insert(queueResearchs).values(
                    payload.queue_ids.map((qid) => ({ research_id: id, queue_id: qid }))
                );
            }
        }

        return { id };
    },

    async remove(id: number, companyId: string): Promise<boolean> {
        const [row] = await db
            .delete(researchs)
            .where(and(eq(researchs.id, id), eq(researchs.company_id, companyId)))
            .returning({ id: researchs.id });
        return !!row;
    },

    // ── Envio após encerramento de ticket ────────────────────────────────────

    async sendSurveyAfterClose(ticket: {
        id: number;
        company_id: string;
        queue_id: number | null;
        contact_id: number;
        connection_id: number | null;
    }): Promise<void> {
        if (!ticket.queue_id) return;

        // Busca pesquisa associada à fila
        const [link] = await db
            .select({ research_id: queueResearchs.research_id })
            .from(queueResearchs)
            .where(eq(queueResearchs.queue_id, ticket.queue_id))
            .limit(1);
        if (!link) return;

        const [research] = await db
            .select()
            .from(researchs)
            .where(and(eq(researchs.id, link.research_id), eq(researchs.active, true)))
            .limit(1);
        if (!research) return;

        const answers = await db
            .select()
            .from(researchAnswers)
            .where(eq(researchAnswers.research_id, research.id));
        if (answers.length === 0) return;

        // Busca número do contato
        const [contact] = await db
            .select({ number: contacts.number })
            .from(contacts)
            .where(eq(contacts.id, ticket.contact_id))
            .limit(1);
        if (!contact?.number) return;

        // Monta mensagem com as opções numeradas
        const opcoes = answers.map((a, i) => `${i + 1}. ${a.title}`).join('\n');
        const mensagem = `${research.name}\n\n${opcoes}\n\nResponda com o número da sua opção.`;

        // Cria registro pendente
        await db.insert(researchHistorics).values({
            company_id:  ticket.company_id,
            ticket_id:   ticket.id,
            research_id: research.id,
            contact_id:  ticket.contact_id,
            answer_id:   null,
            status:      'pending',
        });

        // Envia mensagem via WhatsApp
        const { whatsappService } = await import('../whatsapp/whatsapp.service');
        const connectionId = ticket.connection_id;
        if (connectionId) {
            whatsappService.sendTextToPhone(connectionId, contact.number, mensagem).catch((err: Error) =>
                console.error('[Survey] Falha ao enviar pesquisa:', err.message)
            );
        } else {
            whatsappService.sendMessage(contact.number, mensagem).catch((err: Error) =>
                console.error('[Survey] Falha ao enviar pesquisa:', err.message)
            );
        }
    },

    // ── Captura de resposta (mensagem recebida) ───────────────────────────────

    async tryRecordAnswer(companyId: string, contactId: number, messageBody: string): Promise<boolean> {
        // Busca a pesquisa pendente mais recente deste contato
        const [pending] = await db
            .select()
            .from(researchHistorics)
            .where(and(
                eq(researchHistorics.company_id, companyId),
                eq(researchHistorics.contact_id, contactId),
                eq(researchHistorics.status, 'pending'),
            ))
            .orderBy(desc(researchHistorics.created_at))
            .limit(1);

        if (!pending) return false;

        const answers = await db
            .select()
            .from(researchAnswers)
            .where(eq(researchAnswers.research_id, pending.research_id));

        if (answers.length === 0) return false;

        const text = messageBody.trim();
        const byNumber = /^\d+$/.test(text) ? answers[Number(text) - 1] : undefined;
        const byText   = answers.find(a => a.title.toLowerCase() === text.toLowerCase());
        const matched  = byNumber ?? byText;

        if (!matched) return false;

        await db.update(researchHistorics)
            .set({ answer_id: matched.id, status: 'answered', updated_at: new Date() })
            .where(eq(researchHistorics.id, pending.id));

        return true;
    },

    // ── Relatório — resultados agregados ─────────────────────────────────────

    async getReport(companyId: string, params: {
        dateInit?: string;
        dateEnd?:  string;
        userId?:   string;
        limit?:    number;
        offset?:   number;
    }): Promise<{ items: any[]; total: number; company_users: any[] }> {
        const { dateInit, dateEnd, userId } = params;

        const conditions: any[] = [
            eq(researchHistorics.company_id, companyId),
            eq(researchHistorics.status, 'answered'),
        ];
        if (dateInit) conditions.push(gte(researchHistorics.updated_at, new Date(dateInit)));
        if (dateEnd)  conditions.push(lte(researchHistorics.updated_at, new Date(dateEnd + 'T23:59:59')));

        // Busca agregada: count por answer_id, com nome da pesquisa e da resposta
        let query = db
            .select({
                research_id:   researchs.id,
                research_name: researchs.name,
                research_active: researchs.active,
                answer_id:     researchAnswers.id,
                answer_title:  researchAnswers.title,
                total:         sql<number>`cast(count(*) as int)`,
            })
            .from(researchHistorics)
            .innerJoin(researchs,       eq(researchs.id,       researchHistorics.research_id))
            .innerJoin(researchAnswers, eq(researchAnswers.id, researchHistorics.answer_id))
            .$dynamic();

        if (userId) {
            query = query.innerJoin(tickets, eq(tickets.id, researchHistorics.ticket_id))
                .$dynamic();
            conditions.push(eq(tickets.attendant_user_id, userId));
        }

        const rows = await query
            .where(and(...conditions))
            .groupBy(researchs.id, researchs.name, researchs.active, researchAnswers.id, researchAnswers.title)
            .orderBy(desc(researchs.id));

        // Agrupa em JS por pesquisa
        const map = new Map<number, any>();
        for (const row of rows) {
            if (!map.has(row.research_id)) {
                map.set(row.research_id, {
                    research_id: row.research_id,
                    research:    row.research_name,
                    active:      row.research_active,
                    total:       0,
                    answers:     [] as any[],
                });
            }
            map.get(row.research_id).answers.push({ answerId: row.answer_id, answer: row.answer_title, total: row.total });
            map.get(row.research_id).total += row.total;
        }

        // Calcula percentuais
        const items = Array.from(map.values()).map(r => ({
            ...r,
            answers: r.answers.map((a: any) => ({
                ...a,
                percentage: r.total > 0 ? Math.round((a.total / r.total) * 100) + '%' : '0%',
            })),
        }));

        // Atendentes da empresa para o seletor de filtro
        const company_users = await db
            .select({ id: users.id, name: users.name })
            .from(users)
            .where(and(eq(users.company_id, companyId), eq(users.is_approved, true)))
            .orderBy(users.name);

        return { items, total: items.length, company_users };
    },

    // ── Relatório — drill-down: tickets de uma resposta ──────────────────────

    async getReportDrillDown(companyId: string, params: {
        answerId:  number;
        dateInit?: string;
        dateEnd?:  string;
        limit?:    number;
        offset?:   number;
    }): Promise<{ tickets: any[]; total: number }> {
        const { answerId, dateInit, dateEnd, limit = 50, offset = 0 } = params;

        const conditions: any[] = [
            eq(researchHistorics.company_id, companyId),
            eq(researchHistorics.answer_id,  answerId),
            eq(researchHistorics.status, 'answered'),
        ];
        if (dateInit) conditions.push(gte(researchHistorics.updated_at, new Date(dateInit)));
        if (dateEnd)  conditions.push(lte(researchHistorics.updated_at, new Date(dateEnd + 'T23:59:59')));

        const where = and(...conditions);

        const [rows, countRows] = await Promise.all([
            db
                .select({
                    ticket_id:       tickets.id,
                    answered_at:     researchHistorics.updated_at,
                    contact_name:    contacts.name,
                    contact_number:  contacts.number,
                    attendant_name:  users.name,
                })
                .from(researchHistorics)
                .innerJoin(tickets,  eq(tickets.id,  researchHistorics.ticket_id))
                .innerJoin(contacts, eq(contacts.id, researchHistorics.contact_id))
                .leftJoin(users,     eq(users.id,    tickets.attendant_user_id))
                .where(where)
                .orderBy(desc(researchHistorics.updated_at))
                .limit(limit)
                .offset(offset),
            db
                .select({ count: sql<number>`cast(count(*) as int)` })
                .from(researchHistorics)
                .where(where),
        ]);

        return { tickets: rows, total: countRows[0]?.count ?? 0 };
    },
};
