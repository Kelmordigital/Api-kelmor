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
export declare class NotificationService implements Notifier {
    private readonly repository;
    private readonly pusher;
    constructor(repository: NotificationRepository, pusher: NotificationPush);
    /** Grava uma notificação por destinatário (sem repetir) e avisa quem estiver online. */
    notify(audience: Audience, content: NotificationContent): Promise<void>;
    listMine(userId: string): Promise<{
        items: Notification[];
        unread: number;
    }>;
    markRead(id: number, userId: string): Promise<void>;
    markAllRead(userId: string): Promise<void>;
}
//# sourceMappingURL=notificacao.service.d.ts.map