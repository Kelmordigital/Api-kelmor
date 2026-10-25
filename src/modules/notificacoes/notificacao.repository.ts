import { and, desc, eq, isNull, sql, count } from 'drizzle-orm';
import type { DB } from '../../database/client';
import { users } from '../auth/auth.schema';
import { profiles } from '../profiles/profile.db.schema';
import { notifications, Notification } from './notificacao.db.schema';

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

export class DrizzleNotificationRepository implements NotificationRepository {
    constructor(private readonly db: DB) {}

    async insertForUsers(userIds: string[], notification: NewNotification): Promise<Notification[]> {
        if (userIds.length === 0) return [];
        return this.db.insert(notifications)
            .values(userIds.map((user_id) => ({ ...notification, user_id })))
            .returning();
    }

    listForUser(userId: string, limit: number): Promise<Notification[]> {
        return this.db.select().from(notifications)
            .where(eq(notifications.user_id, userId))
            .orderBy(desc(notifications.created_at), desc(notifications.id))
            .limit(limit);
    }

    async unreadCount(userId: string): Promise<number> {
        const [{ total }] = await this.db.select({ total: count() }).from(notifications)
            .where(and(eq(notifications.user_id, userId), isNull(notifications.read_at)));
        return Number(total);
    }

    async markRead(id: number, userId: string): Promise<boolean> {
        const [row] = await this.db.update(notifications)
            .set({ read_at: sql`coalesce(${notifications.read_at}, now())` })
            .where(and(eq(notifications.id, id), eq(notifications.user_id, userId)))
            .returning({ id: notifications.id });
        return !!row;
    }

    async markAllRead(userId: string): Promise<void> {
        await this.db.update(notifications)
            .set({ read_at: new Date() })
            .where(and(eq(notifications.user_id, userId), isNull(notifications.read_at)));
    }

    async companyAdmins(companyId: string): Promise<string[]> {
        const rows = await this.db.select({ id: users.id }).from(users)
            .innerJoin(profiles, eq(profiles.id, users.profile_id))
            .where(and(eq(users.company_id, companyId), eq(profiles.tag, 'admin')));
        return rows.map((r) => r.id);
    }
}
