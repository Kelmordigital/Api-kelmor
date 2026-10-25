import { eq, and, desc } from 'drizzle-orm';
import type { DB } from '../../database/client';
import { produtos, Produto, NewProduto } from './produto.db.schema';

export type ProdutoData  = Omit<NewProduto, 'id' | 'company_id' | 'created_at' | 'updated_at'>;
export type ProdutoPatch = Partial<ProdutoData>;

/** Persistência de produtos, sempre escopada pela empresa. */
export interface ProdutoRepository {
    listByCompany(companyId: string): Promise<Produto[]>;
    findById(id: string, companyId: string): Promise<Produto | null>;
    create(companyId: string, data: ProdutoData): Promise<Produto>;
    update(id: string, companyId: string, patch: ProdutoPatch): Promise<Produto | null>;
    delete(id: string, companyId: string): Promise<boolean>;
}

export class DrizzleProdutoRepository implements ProdutoRepository {
    constructor(private readonly db: DB) {}

    async listByCompany(companyId: string): Promise<Produto[]> {
        return this.db
            .select()
            .from(produtos)
            .where(eq(produtos.company_id, companyId))
            .orderBy(desc(produtos.created_at));
    }

    async findById(id: string, companyId: string): Promise<Produto | null> {
        const [row] = await this.db
            .select()
            .from(produtos)
            .where(this.byIdInCompany(id, companyId))
            .limit(1);
        return row ?? null;
    }

    async create(companyId: string, data: ProdutoData): Promise<Produto> {
        const [row] = await this.db
            .insert(produtos)
            .values({ ...data, company_id: companyId })
            .returning();
        return row;
    }

    async update(id: string, companyId: string, patch: ProdutoPatch): Promise<Produto | null> {
        const [row] = await this.db
            .update(produtos)
            .set({ ...patch, updated_at: new Date() })
            .where(this.byIdInCompany(id, companyId))
            .returning();
        return row ?? null;
    }

    async delete(id: string, companyId: string): Promise<boolean> {
        const [row] = await this.db
            .delete(produtos)
            .where(this.byIdInCompany(id, companyId))
            .returning({ id: produtos.id });
        return !!row;
    }

    private byIdInCompany(id: string, companyId: string) {
        return and(eq(produtos.id, id), eq(produtos.company_id, companyId));
    }
}
