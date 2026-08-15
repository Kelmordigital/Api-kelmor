import { Cupom, NewCupom } from './cupom.db.schema';
export declare const cupomService: {
    list(companyId: string): Promise<Cupom[]>;
    findById(id: string, companyId: string): Promise<Cupom | null>;
    isCodeTaken(companyId: string, code: string, excludeId?: string): Promise<boolean>;
    create(companyId: string, payload: Omit<NewCupom, "id" | "company_id" | "created_at" | "updated_at">): Promise<Cupom>;
    update(id: string, companyId: string, payload: Partial<Pick<Cupom, "code" | "type" | "value" | "gift_description" | "min_sale_value" | "is_public" | "is_active">>): Promise<Cupom | null>;
    remove(id: string, companyId: string): Promise<boolean>;
};
//# sourceMappingURL=cupom.service.d.ts.map