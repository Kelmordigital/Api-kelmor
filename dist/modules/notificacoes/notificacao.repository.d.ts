import type { DB } from '../../database/client';
import { Notification } from './notificacao.db.schema';
export interface NewNotification {
    company_id: string | null;
    type: string;
    title: string;
    body: string | null;
    data: Record<string, unknown> | null;
}
export interface NotificationRepository {
    insertForUsers(userIds: string[], notification: NewNotification): Promise<Notification[]>;
    listForUser(userId: string, limit: number): Promise<Notification[]>;
    unreadCount(userId: string): Promise<number>;
    markRead(id: number, userId: string): Promise<boolean>;
    markAllRead(userId: string): Promise<void>;
    /** Ids dos administradores da empresa. */
    companyAdmins(companyId: string): Promise<string[]>;
}
export declare class DrizzleNotificationRepository implements NotificationRepository {
    private readonly db;
    constructor(db: DB);
    insertForUsers(userIds: string[], notification: NewNotification): Promise<Notification[]>;
    listForUser(userId: string, limit: number): Promise<Notification[]>;
    unreadCount(userId: string): Promise<number>;
    markRead(id: number, userId: string): Promise<boolean>;
    markAllRead(userId: string): Promise<void>;
    companyAdmins(companyId: string): Promise<string[]>;
}
//# sourceMappingURL=notificacao.repository.d.ts.map