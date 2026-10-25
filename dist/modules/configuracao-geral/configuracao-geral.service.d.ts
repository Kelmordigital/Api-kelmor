import type { CompanyPermission } from './configuracao-geral.db.schema';
import type { AutomaticMessages, ConfiguracaoGeralRepository } from './configuracao-geral.repository';
import type { UpdateConfiguracaoGeralInput } from './configuracao-geral.dto';
/**
 * Permissões da empresa — tudo o que outros módulos (tickets, filas,
 * conquistas, API de mensagens...) precisam desta configuração (ISP/DIP).
 */
export interface CompanyPermissionsReader {
    forCompany(companyId: string): Promise<CompanyPermission>;
}
/** Avisa quem está com o sistema aberto que a configuração mudou. */
export interface CompanySettingsNotifier {
    permissionsChanged(companyId: string): void;
}
export type ConfiguracaoGeralView = Partial<AutomaticMessages> & CompanyPermission & {
    notify_emails: string[];
};
export declare class ConfiguracaoGeralService implements CompanyPermissionsReader {
    private readonly repository;
    private readonly notifier;
    constructor(repository: ConfiguracaoGeralRepository, notifier: CompanySettingsNotifier);
    forCompany(companyId: string): Promise<CompanyPermission>;
    view(companyId: string): Promise<ConfiguracaoGeralView>;
    update(companyId: string, input: UpdateConfiguracaoGeralInput): Promise<ConfiguracaoGeralView>;
    /** Mensagem do editor rico: guardada como veio, ou null se não tiver texto além das tags. */
    private static messageText;
    /** Sem espaços, em minúsculas, sem vazios nem repetidos; recusa e-mail malformado. */
    private static notifyEmails;
}
//# sourceMappingURL=configuracao-geral.service.d.ts.map