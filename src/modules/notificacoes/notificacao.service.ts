import { NotFoundError } from '../../core/errors/http-errors';
import type { Notification } from './notificacao.db.schema';
import type { NotificationRepository } from './notificacao.repository';

/** Para quem vai o aviso, dentro de uma empresa. */
export interface Audience {
    companyId: string;
    /** Usuários específicos (ex.: quem criou o agendamento). */
    userIds?: (string | null | undefined)[];
    /** Inclui também todos os administradores da empresa. */
    includeAdmins?: boolean;
}

export interface NotificationContent {
    type: string;
    title: string;
    body?: string | null;
    /** Contexto para a tela abrir (ex.: { ticket_id }). */
    data?: Record<string, unknown>;
}

/** O que outros módulos precisam para avisar usuários (ISP). */
export interface Notifier {
    notify(audience: Audience, content: NotificationContent): Promise<void>;
}

/** Entrega em tempo real para quem estiver com o sistema aberto (melhor esforço). */
export interface NotificationPush {
    push(userId: string, notification: Notification): void;
}

const LIST_LIMIT = 50;

export class NotificationService implements Notifier {
    constructor(
        private readonly repository: NotificationRepository,
        private readonly pusher: NotificationPush,
    ) {}

    /** Grava uma notificação por destinatário (sem repetir) e avisa quem estiver online. */
    async notify(audience: Audience, content: NotificationContent): Promise<void> {
        const recipients = new Set(audience.userIds?.filter((id): id is string => !!id));
        if (audience.includeAdmins) {
            for (const id of await this.repository.companyAdmins(audience.companyId)) recipients.add(id);
        }

        const saved = await this.repository.insertForUsers([...recipients], {
            company_id: audience.companyId,
            type: content.type,
            title: content.title,
            body: content.body ?? null,
            data: content.data ?? null,
        });
        for (const notification of saved) this.pusher.push(notification.user_id, notification);
    }

    async listMine(userId: string): Promise<{ items: Notification[]; unread: number }> {
        const [items, unread] = await Promise.all([
            this.repository.listForUser(userId, LIST_LIMIT),
            this.repository.unreadCount(userId),
        ]);
        return { items, unread };
    }

    async markRead(id: number, userId: string): Promise<void> {
        if (!(await this.repository.markRead(id, userId))) throw new NotFoundError('Notificação não encontrada');
    }

    markAllRead(userId: string): Promise<void> {
        return this.repository.markAllRead(userId);
    }
}
