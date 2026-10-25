import type { DB } from '../../database/client';
import { Cupom, NewCupom } from './cupom.db.schema';
export type CupomData = Omit<NewCupom, 'id' | 'company_id' | 'created_at' | 'updated_at'>;
export declare const DUPLICATE_CODE_MESSAGE = "J\u00E1 existe um cupom com esse c\u00F3digo";
/** Persistência de cupons, sempre escopada pela empresa. */
export interface CupomRepository {
    listByCompany(companyId: string): Promise<Cupom[]>;
    findById(id: string, companyId: string): Promise<Cupom | null>;
    isCodeTaken(companyId: string, code: string, excludeId?: string): Promise<boolean>;
    /** Lança ConflictError se o código já existe na empresa. */
    create(companyId: string, data: CupomData): Promise<Cupom>;
    /** Lança ConflictError se o código já existe na empresa. */
    update(id: string, companyId: string, data: CupomData): Promise<Cupom | null>;
    delete(id: string, companyId: string): Promise<boolean>;
}
export declare class DrizzleCupomRepository implements CupomRepository {
    private readonly db;
    constructor(db: DB);
    listByCompany(companyId: string): Promise<Cupom[]>;
    findById(id: string, companyId: string): Promise<Cupom | null>;
    isCodeTaken(companyId: string, code: string, excludeId?: string): Promise<boolean>;
    create(companyId: string, data: CupomData): Promise<Cupom>;
    update(id: string, companyId: string, data: CupomData): Promise<Cupom | null>;
    delete(id: string, companyId: string): Promise<boolean>;
    private byIdInCompany;
    /** Duas requisições simultâneas passam pelo isCodeTaken; o índice único decide. */
    private guardUniqueCode;
}
//# sourceMappingURL=cupom.repository.d.ts.map