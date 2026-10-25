import { eq } from 'drizzle-orm';
import type { DB } from '../../database/client';
import { companies } from '../companies/company.db.schema';
import { companyPermissions, companyEmailNotify, CompanyPermission } from './configuracao-geral.db.schema';
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

type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];

export class DrizzleConfiguracaoGeralRepository implements ConfiguracaoGeralRepository {
    constructor(private readonly db: DB) {}

    async findOrCreatePermissions(companyId: string): Promise<CompanyPermission> {
        // onConflictDoNothing: duas leituras simultâneas da mesma empresa não colidem
        const [created] = await this.db.insert(companyPermissions)
            .values({ company_id: companyId })
            .onConflictDoNothing({ target: companyPermissions.company_id })
            .returning();
        if (created) return created;

        const [existing] = await this.db.select().from(companyPermissions)
            .where(eq(companyPermissions.company_id, companyId));
        return existing;
    }

    async findMessages(companyId: string): Promise<AutomaticMessages | null> {
        const [row] = await this.db.select({
            init_message:     companies.init_message,
            end_message:      companies.end_message,
            transfer_message: companies.transfer_message,
        }).from(companies).where(eq(companies.id, companyId));
        return row ?? null;
    }

    async listNotifyEmails(companyId: string): Promise<string[]> {
        const rows = await this.db.select({ email: companyEmailNotify.email })
            .from(companyEmailNotify)
            .where(eq(companyEmailNotify.company_id, companyId));
        return rows.map((r) => r.email);
    }

    async save(companyId: string, changes: ConfiguracaoGeralChanges): Promise<void> {
        await this.db.transaction(async (tx) => {
            await this.saveMessages(tx, companyId, changes.messages);
            await this.savePermissions(tx, companyId, changes.permissions);
            if (changes.notifyEmails) await this.replaceNotifyEmails(tx, companyId, changes.notifyEmails);
        });
    }

    private async saveMessages(tx: Tx, companyId: string, messages: Partial<AutomaticMessages>) {
        if (Object.keys(messages).length === 0) return;
        await tx.update(companies)
            .set({ ...messages, updated_at: new Date() })
            .where(eq(companies.id, companyId));
    }

    private async savePermissions(tx: Tx, companyId: string, permissions: PermissionsPatch) {
        if (Object.keys(permissions).length === 0) return;
        await tx.insert(companyPermissions)
            .values({ ...permissions, company_id: companyId })
            .onConflictDoUpdate({
                target: companyPermissions.company_id,
                set: { ...permissions, updated_at: new Date() },
            });
    }

    private async replaceNotifyEmails(tx: Tx, companyId: string, emails: string[]) {
        await tx.delete(companyEmailNotify).where(eq(companyEmailNotify.company_id, companyId));
        if (emails.length > 0) {
            await tx.insert(companyEmailNotify).values(emails.map((email) => ({ company_id: companyId, email })));
        }
    }
}
