"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
const http_errors_1 = require("../../core/errors/http-errors");
const LIST_LIMIT = 50;
class NotificationService {
    repository;
    pusher;
    constructor(repository, pusher) {
        this.repository = repository;
        this.pusher = pusher;
    }
    /** Grava uma notificação por destinatário (sem repetir) e avisa quem estiver online. */
    async notify(audience, content) {
        const recipients = new Set(audience.userIds?.filter((id) => !!id));
        if (audience.includeAdmins) {
            for (const id of await this.repository.companyAdmins(audience.companyId))
                recipients.add(id);
        }
        const saved = await this.repository.insertForUsers([...recipients], {
            company_id: audience.companyId,
            type: content.type,
            title: content.title,
            body: content.body ?? null,
            data: content.data ?? null,
        });
        for (const notification of saved)
            this.pusher.push(notification.user_id, notification);
    }
    async listMine(userId) {
        const [items, unread] = await Promise.all([
            this.repository.listForUser(userId, LIST_LIMIT),
            this.repository.unreadCount(userId),
        ]);
        return { items, unread };
    }
    async markRead(id, userId) {
        if (!(await this.repository.markRead(id, userId)))
            throw new http_errors_1.NotFoundError('Notificação não encontrada');
    }
    markAllRead(userId) {
        return this.repository.markAllRead(userId);
    }
}
exports.NotificationService = NotificationService;
//# sourceMappingURL=notificacao.service.js.map