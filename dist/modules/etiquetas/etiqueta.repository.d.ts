import type { DB } from '../../database/client';
import { Etiqueta, NewEtiqueta } from './etiqueta.db.schema';
export type EtiquetaData = Omit<NewEtiqueta, 'id' | 'company_id' | 'created_at' | 'updated_at'>;
export type EtiquetaPatch = Partial<Pick<Etiqueta, 'name' | 'color' | 'icon'>>;
export interface TagUsage {
    /** Contatos com a etiqueta, ao todo. */
    totals: Map<string, number>;
    /** Aplicações por dia (YYYY-MM-DD) desde `since`. */
    daily: Map<string, Map<string, number>>;
}
export interface EtiquetaRepository {
    listByCompany(companyId: string): Promise<Etiqueta[]>;
    findById(id: string, companyId: string): Promise<Etiqueta | null>;
    create(companyId: string, data: EtiquetaData): Promise<Etiqueta>;
    update(id: string, companyId: string, patch: EtiquetaPatch): Promise<Etiqueta | null>;
    delete(id: string, companyId: string): Promise<boolean>;
    /** Idempotente: aplicar de novo não duplica. */
    linkToContact(contactId: number, etiquetaId: string): Promise<void>;
    unlinkFromContact(contactId: number, etiquetaId: string): Promise<void>;
    listForContact(contactId: number, companyId: string): Promise<Etiqueta[]>;
    usage(etiquetaIds: string[], since: Date): Promise<TagUsage>;
}
export declare class DrizzleEtiquetaRepository implements EtiquetaRepository {
    private readonly db;
    constructor(db: DB);
    listByCompany(companyId: string): Promise<Etiqueta[]>;
    findById(id: string, companyId: string): Promise<Etiqueta | null>;
    create(companyId: string, data: EtiquetaData): Promise<Etiqueta>;
    update(id: string, companyId: string, patch: EtiquetaPatch): Promise<Etiqueta | null>;
    delete(id: string, companyId: string): Promise<boolean>;
    linkToContact(contactId: number, etiquetaId: string): Promise<void>;
    unlinkFromContact(contactId: number, etiquetaId: string): Promise<void>;
    listForContact(contactId: number, companyId: string): Promise<Etiqueta[]>;
    usage(etiquetaIds: string[], since: Date): Promise<TagUsage>;
    private byIdInCompany;
}
//# sourceMappingURL=etiqueta.repository.d.ts.map