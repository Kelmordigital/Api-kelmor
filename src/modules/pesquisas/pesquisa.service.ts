import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../../database/client';
import { researchs, researchAnswers, queueResearchs } from './pesquisa.db.schema';
import { queues } from '../atendimento/atendimento.db.schema';

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
};
