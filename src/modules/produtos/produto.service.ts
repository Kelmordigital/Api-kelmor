import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../database/client';
import { produtos, Produto, NewProduto } from './produto.db.schema';

export const produtoService = {

    async list(companyId: string): Promise<Produto[]> {
        return db
            .select()
            .from(produtos)
            .where(eq(produtos.company_id, companyId))
            .orderBy(desc(produtos.created_at));
    },

    async findById(id: string, companyId: string): Promise<Produto | null> {
        const [row] = await db
            .select()
            .from(produtos)
            .where(and(eq(produtos.id, id), eq(produtos.company_id, companyId)))
            .limit(1);
        return row ?? null;
    },

    async create(
        companyId: string,
        payload: Omit<NewProduto, 'id' | 'company_id' | 'created_at' | 'updated_at'>,
    ): Promise<Produto> {
        const [row] = await db
            .insert(produtos)
            .values({ ...payload, company_id: companyId })
            .returning();
        return row;
    },

    async update(
        id: string,
        companyId: string,
        payload: Partial<Pick<Produto,
            'name' | 'short_description' | 'value_type' | 'value' |
            'delivery_timeframe' | 'how_it_works' | 'full_description' | 'is_active'
        >>,
    ): Promise<Produto | null> {
        const [row] = await db
            .update(produtos)
            .set({ ...payload, updated_at: new Date() })
            .where(and(eq(produtos.id, id), eq(produtos.company_id, companyId)))
            .returning();
        return row ?? null;
    },

    async remove(id: string, companyId: string): Promise<boolean> {
        const [row] = await db
            .delete(produtos)
            .where(and(eq(produtos.id, id), eq(produtos.company_id, companyId)))
            .returning();
        return !!row;
    },
};
