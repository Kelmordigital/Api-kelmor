import { Etiqueta, NewEtiqueta } from './etiqueta.db.schema';
export declare const etiquetaService: {
    list(companyId: string): Promise<Etiqueta[]>;
    findById(id: string, companyId: string): Promise<Etiqueta | null>;
    create(companyId: string, payload: Omit<NewEtiqueta, "id" | "company_id" | "created_at" | "updated_at">): Promise<Etiqueta>;
    update(id: string, companyId: string, payload: Partial<Pick<Etiqueta, "name" | "color" | "icon" | "keyword_trigger" | "keyword_type">>): Promise<Etiqueta | null>;
    remove(id: string, companyId: string): Promise<boolean>;
    getStats(companyId: string): Promise<{
        etiqueta_id: string;
        name: string;
        color: string;
        total_leads: number;
        series: {
            date: string;
            count: number;
        }[];
    }[]>;
    aplicarAoContato(contactId: string, etiquetaId: string, companyId: string): Promise<void>;
    removerDoContato(contactId: string, etiquetaId: string): Promise<void>;
    listDoContato(contactId: string): Promise<Etiqueta[]>;
};
//# sourceMappingURL=etiqueta.service.d.ts.map