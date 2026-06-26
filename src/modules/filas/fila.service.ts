import { eq, and } from 'drizzle-orm';
import { db } from '../../database/client';
import { queues, Queue } from '../atendimento/atendimento.db.schema';

export const filaService = {

    async list(companyId: string): Promise<Queue[]> {
        return db
            .select()
            .from(queues)
            .where(eq(queues.company_id, companyId));
    },

    async findById(id: number, companyId: string): Promise<Queue | null> {
        const [row] = await db
            .select()
            .from(queues)
            .where(and(eq(queues.id, id), eq(queues.company_id, companyId)))
            .limit(1);
        return row ?? null;
    },

    async create(companyId: string, payload: {
        name: string;
        color?: string | null;
        greeting_message?: string | null;
        enabled?: boolean;
    }): Promise<Queue> {
        const [row] = await db
            .insert(queues)
            .values({ company_id: companyId, ...payload })
            .returning();
        return row;
    },

    async update(id: number, companyId: string, payload: {
        name?: string;
        color?: string | null;
        greeting_message?: string | null;
        enabled?: boolean;
    }): Promise<Queue | null> {
        const [row] = await db
            .update(queues)
            .set(payload)
            .where(and(eq(queues.id, id), eq(queues.company_id, companyId)))
            .returning();
        return row ?? null;
    },

    async remove(id: number, companyId: string): Promise<boolean> {
        const [row] = await db
            .delete(queues)
            .where(and(eq(queues.id, id), eq(queues.company_id, companyId)))
            .returning();
        return !!row;
    },
};
