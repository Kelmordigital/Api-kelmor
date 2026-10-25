import type { CompanyDirectory } from '../companies/company-directory';
import type { Etiqueta } from './etiqueta.db.schema';
import type { EtiquetaRepository } from './etiqueta.repository';
import type { CreateEtiquetaInput, UpdateEtiquetaInput } from './etiqueta.dto';
export interface EtiquetaStats {
    etiqueta_id: string;
    name: string;
    color: string;
    total_leads: number;
    series: {
        date: string;
        count: number;
    }[];
}
/** Aplicar etiqueta num contato — o que o bot e as regras automáticas precisam (ISP). */
export interface ContactTagger {
    applyToContact(companyId: string, contactId: number, etiquetaId: string): Promise<void>;
}
export declare class EtiquetaService implements ContactTagger {
    private readonly repository;
    private readonly directory;
    private readonly now;
    constructor(repository: EtiquetaRepository, directory: CompanyDirectory, now?: () => Date);
    list(companyId: string): Promise<Etiqueta[]>;
    create(companyId: string, input: CreateEtiquetaInput): Promise<Etiqueta>;
    update(id: string, companyId: string, input: UpdateEtiquetaInput): Promise<Etiqueta>;
    remove(id: string, companyId: string): Promise<void>;
    /** Etiqueta e contato precisam ser da empresa. Aplicar de novo não duplica. */
    applyToContact(companyId: string, contactId: number, etiquetaId: string): Promise<void>;
    /** Sem efeito (e sem erro) se a etiqueta ou o contato não forem da empresa. */
    removeFromContact(companyId: string, contactId: number, etiquetaId: string): Promise<void>;
    /** Contato de outra empresa responde lista vazia (não revela que existe). */
    listForContact(companyId: string, contactId: number): Promise<Etiqueta[]>;
    /** Total de contatos por etiqueta e aplicações por dia nos últimos 7 dias (hoje incluso, UTC). */
    getStats(companyId: string): Promise<EtiquetaStats[]>;
    private lastDays;
    private static tagNotFound;
}
//# sourceMappingURL=etiqueta.service.d.ts.map