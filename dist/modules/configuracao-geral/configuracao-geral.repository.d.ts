import type { DB } from '../../database/client';
import { CompanyPermission } from './configuracao-geral.db.schema';
import type { PermissionsPatch } from './configuracao-geral.dto';
export interface AutomaticMessages {
    init_message: string | null;
    end_message: string | null;
    transfer_message: string | null;
}
export interface ConfiguracaoGeralChanges {
    messages: Partial<AutomaticMessages>;
    permissions: PermissionsPatch;
    /** undefined = não mexe; lista = substitui a atual. */
    notifyEmails?: string[];
}
/** Configuração da empresa espalhada em três tabelas: companies, company_permissions e company_email_notify. */
export interface ConfiguracaoGeralRepository {
    /** Cria com os padrões do schema na primeira leitura. */
    findOrCreatePermissions(companyId: string): Promise<CompanyPermission>;
    findMessages(companyId: string): Promise<AutomaticMessages | null>;
    listNotifyEmails(companyId: string): Promise<string[]>;
    /** Grava tudo ou nada (uma transação). */
    save(companyId: string, changes: ConfiguracaoGeralChanges): Promise<void>;
}
export declare class DrizzleConfiguracaoGeralRepository implements ConfiguracaoGeralRepository {
    private readonly db;
    constructor(db: DB);
    findOrCreatePermissions(companyId: string): Promise<CompanyPermission>;
    findMessages(companyId: string): Promise<AutomaticMessages | null>;
    listNotifyEmails(companyId: string): Promise<string[]>;
    save(companyId: string, changes: ConfiguracaoGeralChanges): Promise<void>;
    private saveMessages;
    private savePermissions;
    private replaceNotifyEmails;
}
//# sourceMappingURL=configuracao-geral.repository.d.ts.map