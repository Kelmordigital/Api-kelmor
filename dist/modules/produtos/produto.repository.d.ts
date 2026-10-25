import type { DB } from '../../database/client';
import { Produto, NewProduto } from './produto.db.schema';
export type ProdutoData = Omit<NewProduto, 'id' | 'company_id' | 'created_at' | 'updated_at'>;
export type ProdutoPatch = Partial<ProdutoData>;
/** Persistência de produtos, sempre escopada pela empresa. */
export interface ProdutoRepository {
    listByCompany(companyId: string): Promise<Produto[]>;
    findById(id: string, companyId: string): Promise<Produto | null>;
    create(companyId: string, data: ProdutoData): Promise<Produto>;
    update(id: string, companyId: string, patch: ProdutoPatch): Promise<Produto | null>;
    delete(id: string, companyId: string): Promise<boolean>;
}
export declare class DrizzleProdutoRepository implements ProdutoRepository {
    private readonly db;
    constructor(db: DB);
    listByCompany(companyId: string): Promise<Produto[]>;
    findById(id: string, companyId: string): Promise<Produto | null>;
    create(companyId: string, data: ProdutoData): Promise<Produto>;
    update(id: string, companyId: string, patch: ProdutoPatch): Promise<Produto | null>;
    delete(id: string, companyId: string): Promise<boolean>;
    private byIdInCompany;
}
//# sourceMappingURL=produto.repository.d.ts.map