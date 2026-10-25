"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfiguracaoGeralService = void 0;
const http_errors_1 = require("../../core/errors/http-errors");
const MESSAGE_FIELDS = ['init_message', 'end_message', 'transfer_message'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
class ConfiguracaoGeralService {
    repository;
    notifier;
    constructor(repository, notifier) {
        this.repository = repository;
        this.notifier = notifier;
    }
    forCompany(companyId) {
        return this.repository.findOrCreatePermissions(companyId);
    }
    async view(companyId) {
        const permissions = await this.repository.findOrCreatePermissions(companyId);
        const [messages, emails] = await Promise.all([
            this.repository.findMessages(companyId),
            this.repository.listNotifyEmails(companyId),
        ]);
        return { ...messages, ...permissions, notify_emails: emails };
    }
    async update(companyId, input) {
        const messages = {};
        for (const field of MESSAGE_FIELDS) {
            if (input[field] !== undefined)
                messages[field] = ConfiguracaoGeralService.messageText(input[field]);
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
    static messageText(html) {
        if (!html || html.replace(/<[^>]+>/g, '').trim() === '')
            return null;
        return html;
    }
    /** Sem espaços, em minúsculas, sem vazios nem repetidos; recusa e-mail malformado. */
    static notifyEmails(raw) {
        const emails = [...new Set(raw.map((e) => e.trim().toLowerCase()).filter(Boolean))];
        const bad = emails.find((e) => !EMAIL_PATTERN.test(e));
        if (bad)
            throw new http_errors_1.BadRequestError(`E-mail inválido: ${bad}`);
        return emails;
    }
}
exports.ConfiguracaoGeralService = ConfiguracaoGeralService;
//# sourceMappingURL=configuracao-geral.service.js.map