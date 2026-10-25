import { BadRequestError } from '../../core/errors/http-errors';
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

export type ConfiguracaoGeralView = Partial<AutomaticMessages> & CompanyPermission & { notify_emails: string[] };

const MESSAGE_FIELDS = ['init_message', 'end_message', 'transfer_message'] as const;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class ConfiguracaoGeralService implements CompanyPermissionsReader {
    constructor(
        private readonly repository: ConfiguracaoGeralRepository,
        private readonly notifier: CompanySettingsNotifier,
    ) {}

    forCompany(companyId: string): Promise<CompanyPermission> {
        return this.repository.findOrCreatePermissions(companyId);
    }

    async view(companyId: string): Promise<ConfiguracaoGeralView> {
        const permissions = await this.repository.findOrCreatePermissions(companyId);
        const [messages, emails] = await Promise.all([
            this.repository.findMessages(companyId),
            this.repository.listNotifyEmails(companyId),
        ]);
        return { ...messages, ...permissions, notify_emails: emails };
    }

    async update(companyId: string, input: UpdateConfiguracaoGeralInput): Promise<ConfiguracaoGeralView> {
        const messages: Partial<AutomaticMessages> = {};
        for (const field of MESSAGE_FIELDS) {
            if (input[field] !== undefined) messages[field] = ConfiguracaoGeralService.messageText(input[field]);
        }

        await this.repository.save(companyId, {
            messages,
            permissions: input.permissions,
            notifyEmails: input.notify_emails && ConfiguracaoGeralService.notifyEmails(input.notify_emails),
        });

        // Sem isso, quem já está com o sistema aberto só veria a mudança depois
        // do cache do front (5 min) ou de um refresh manual.
        this.notifier.permissionsChanged(companyId);
        return this.view(companyId);
    }

    /** Mensagem do editor rico: guardada como veio, ou null se não tiver texto além das tags. */
    private static messageText(html: string | null | undefined): string | null {
        if (!html || html.replace(/<[^>]+>/g, '').trim() === '') return null;
        return html;
    }

    /** Sem espaços, em minúsculas, sem vazios nem repetidos; recusa e-mail malformado. */
    private static notifyEmails(raw: string[]): string[] {
        const emails = [...new Set(raw.map((e) => e.trim().toLowerCase()).filter(Boolean))];
        const bad = emails.find((e) => !EMAIL_PATTERN.test(e));
        if (bad) throw new BadRequestError(`E-mail inválido: ${bad}`);
        return emails;
    }
}
