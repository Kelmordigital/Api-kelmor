import { and, eq, inArray } from 'drizzle-orm';
import type { DB } from '../../database/client';
import { users } from '../auth/auth.schema';
import { connections, contacts } from '../atendimento/atendimento.db.schema';

/**
 * "Isto é desta empresa?" — para conferir ids vindos do cliente antes de
 * gravá-los ou usá-los, e assim não misturar dados entre empresas.
 */
export interface CompanyDirectory {
    hasUser(companyId: string, userId: string): Promise<boolean>;
    hasContact(companyId: string, contactId: number): Promise<boolean>;
}

/** Filtra listas de ids vindas do cliente, mantendo só os da empresa. */
export interface CompanyResourceFilter {
    ownedConnectionIds(companyId: string, ids: number[]): Promise<number[]>;
    ownedContactIds(companyId: string, ids: number[]): Promise<number[]>;
}

export class DrizzleCompanyDirectory implements CompanyDirectory, CompanyResourceFilter {
    constructor(private readonly db: DB) {}

    async hasUser(companyId: string, userId: string): Promise<boolean> {
        const [row] = await this.db.select({ id: users.id }).from(users)
            .where(and(eq(users.id, userId), eq(users.company_id, companyId)))
            .limit(1);
        return !!row;
    }

    async hasContact(companyId: string, contactId: number): Promise<boolean> {
        const [row] = await this.db.select({ id: contacts.id }).from(contacts)
            .where(and(eq(contacts.id, contactId), eq(contacts.company_id, companyId)))
            .limit(1);
        return !!row;
    }

    async ownedConnectionIds(companyId: string, ids: number[]): Promise<number[]> {
        if (ids.length === 0) return [];
        const rows = await this.db.select({ id: connections.id }).from(connections)
            .where(and(eq(connections.company_id, companyId), inArray(connections.id, ids)));
        return rows.map((r) => r.id);
    }

    async ownedContactIds(companyId: string, ids: number[]): Promise<number[]> {
        if (ids.length === 0) return [];
        const rows = await this.db.select({ id: contacts.id }).from(contacts)
            .where(and(eq(contacts.company_id, companyId), inArray(contacts.id, ids)));
        return rows.map((r) => r.id);
    }
}
