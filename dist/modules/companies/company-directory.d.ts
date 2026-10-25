import type { DB } from '../../database/client';
/**
 * "Isto é desta empresa?" — para conferir ids vindos do cliente antes de
 * gravá-los ou usá-los, e assim não misturar dados entre empresas.
 */
export interface CompanyDirectory {
    hasUser(companyId: string, userId: string): Promise<boolean>;
    hasContact(companyId: string, contactId: number): Promise<boolean>;
}
/** Filtra listas de ids vindas do cliente, mantendo só os da empresa. */
export interface CompanyResourceFilter {
    ownedConnectionIds(companyId: string, ids: number[]): Promise<number[]>;
    ownedContactIds(companyId: string, ids: number[]): Promise<number[]>;
}
export declare class DrizzleCompanyDirectory implements CompanyDirectory, CompanyResourceFilter {
    private readonly db;
    constructor(db: DB);
    hasUser(companyId: string, userId: string): Promise<boolean>;
    hasContact(companyId: string, contactId: number): Promise<boolean>;
    ownedConnectionIds(companyId: string, ids: number[]): Promise<number[]>;
    ownedContactIds(companyId: string, ids: number[]): Promise<number[]>;
}
//# sourceMappingURL=company-directory.d.ts.map