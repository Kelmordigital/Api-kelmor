import { Etiqueta, NewEtiqueta } from './etiqueta.db.schema';
export declare const etiquetaService: {
    list(companyId: string): Promise<Etiqueta[]>;
    findById(id: string, companyId: string): Promise<Etiqueta | null>;
    create(companyId: string, payload: Omit<NewEtiqueta, "id" | "company_id" | "created_at" | "updated_at">): Promise<Etiqueta>;
    update(id: string, companyId: string, payload: Partial<Pick<Etiqueta, "name" | "color" | "icon">>): Promise<Etiqueta | null>;
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
    removerDoContato(contactId: string, etiquetaId: string, companyId: string): Promise<void>;
    listDoContato(contactId: string, companyId: string): Promise<Etiqueta[]>;
};
/**
 * Etiquetamento automático: casa o texto de uma mensagem contra as regras
 * (at_automatic_tag_rules) cadastradas pela empresa. Cada regra tem uma
 * lista de variações de palavra-chave separadas por vírgula (ex: "fralda,
 * frauda, fraldinha") — qualquer uma delas ativa a regra — e pode apontar
 * para múltiplas etiquetas. Idempotente via ON CONFLICT DO NOTHING em
 * aplicarAoContato.
 */
export declare function matchAndApplyAutomaticTags(companyId: string, contactId: number, messageText: string): Promise<void>;
//# sourceMappingURL=etiqueta.service.d.ts.map