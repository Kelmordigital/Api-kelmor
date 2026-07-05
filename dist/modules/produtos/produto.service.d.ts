import { Produto, NewProduto } from './produto.db.schema';
export declare const produtoService: {
    list(companyId: string): Promise<Produto[]>;
    findById(id: string, companyId: string): Promise<Produto | null>;
    create(companyId: string, payload: Omit<NewProduto, "id" | "company_id" | "created_at" | "updated_at">): Promise<Produto>;
    update(id: string, companyId: string, payload: Partial<Pick<Produto, "name" | "short_description" | "value_type" | "value" | "delivery_timeframe" | "how_it_works" | "full_description" | "is_active">>): Promise<Produto | null>;
    remove(id: string, companyId: string): Promise<boolean>;
};
//# sourceMappingURL=produto.service.d.ts.map