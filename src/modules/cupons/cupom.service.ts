import { eq, and, ne, desc } from 'drizzle-orm';
import { db } from '../../database/client';
import { cupons, Cupom, NewCupom } from './cupom.db.schema';

export const cupomService = {

    async list(companyId: string): Promise<Cupom[]> {
        return db
            .select()
            .from(cupons)
            .where(eq(cupons.company_id, companyId))
            .orderBy(desc(cupons.created_at));
    },

    async findById(id: string, companyId: string): Promise<Cupom | null> {
        const [row] = await db
            .select()
            .from(cupons)
            .where(and(eq(cupons.id, id), eq(cupons.company_id, companyId)))
            .limit(1);
        return row ?? null;
    },

    async isCodeTaken(companyId: string, code: string, excludeId?: string): Promise<boolean> {
        const conditions = [eq(cupons.company_id, companyId), eq(cupons.code, code)];
        if (excludeId) conditions.push(ne(cupons.id, excludeId));
        const [row] = await db
            .select({ id: cupons.id })
            .from(cupons)
            .where(and(...conditions))
            .limit(1);
        return !!row;
    },

    async create(
        companyId: string,
        payload: Omit<NewCupom, 'id' | 'company_id' | 'created_at' | 'updated_at'>,
    ): Promise<Cupom> {
        const [row] = await db
            .insert(cupons)
            .values({ ...payload, company_id: companyId })
            .returning();
        return row;
    },

    async update(
        id: string,
        companyId: string,
        payload: Partial<Pick<Cupom,
            'code' | 'type' | 'value' | 'gift_description' |
            'min_sale_value' | 'is_public' | 'is_active'
        >>,
    ): Promise<Cupom | null> {
        const [row] = await db
            .update(cupons)
            .set({ ...payload, updated_at: new Date() })
            .where(and(eq(cupons.id, id), eq(cupons.company_id, companyId)))
            .returning();
        return row ?? null;
    },

    async remove(id: string, companyId: string): Promise<boolean> {
        const [row] = await db
            .delete(cupons)
            .where(and(eq(cupons.id, id), eq(cupons.company_id, companyId)))
            .returning();
        return !!row;
    },
};
