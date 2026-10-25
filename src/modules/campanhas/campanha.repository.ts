import { eq, and, asc, sql } from 'drizzle-orm';
import type { DB } from '../../database/client';
import { connections, contacts } from '../atendimento/atendimento.db.schema';
import { scheduledMessageTexts } from './campanha.db.schema';

export type ScheduledText = typeof scheduledMessageTexts.$inferSelect;

export interface CampaignOptions {
    connections: { id: number; name: string; status: string | null }[];
    contacts: { id: number; name: string; number: string | null }[];
}

export interface ScheduledTextData {
    label: string;
    text: string | null;
    type: number;
}

/** Dados locais do módulo: opções do formulário e textos de agendamento. */
export interface CampanhaRepository {
    options(companyId: string): Promise<CampaignOptions>;
    listTexts(companyId: string): Promise<ScheduledText[]>;
    /** Maior posição (type) usada pela empresa; 0 se não houver textos. */
    lastTextPosition(companyId: string): Promise<number>;
    insertTexts(companyId: string, texts: ScheduledTextData[]): Promise<ScheduledText[]>;
    updateText(id: number, companyId: string, data: { label: string; text: string | null }): Promise<ScheduledText | null>;
    deleteText(id: number, companyId: string): Promise<boolean>;
}

export class DrizzleCampanhaRepository implements CampanhaRepository {
    constructor(private readonly db: DB) {}

    async options(companyId: string): Promise<CampaignOptions> {
        const [conns, cts] = await Promise.all([
            this.db.select({ id: connections.id, name: connections.name, status: connections.status })
                .from(connections).where(eq(connections.company_id, companyId)),
            this.db.select({ id: contacts.id, name: contacts.name, number: contacts.number })
                .from(contacts).where(eq(contacts.company_id, companyId)),
        ]);
        return { connections: conns, contacts: cts };
    }

    listTexts(companyId: string): Promise<ScheduledText[]> {
        return this.db.select().from(scheduledMessageTexts)
            .where(eq(scheduledMessageTexts.company_id, companyId))
            .orderBy(asc(scheduledMessageTexts.type), asc(scheduledMessageTexts.id));
    }

    async lastTextPosition(companyId: string): Promise<number> {
        const [{ last }] = await this.db.select({ last: sql<number>`coalesce(max(${scheduledMessageTexts.type}), 0)::int` })
            .from(scheduledMessageTexts)
            .where(eq(scheduledMessageTexts.company_id, companyId));
        return last;
    }

    async insertTexts(companyId: string, texts: ScheduledTextData[]): Promise<ScheduledText[]> {
        if (texts.length === 0) return [];
        return this.db.insert(scheduledMessageTexts)
            .values(texts.map((t) => ({ ...t, company_id: companyId })))
            .returning();
    }

    async updateText(id: number, companyId: string, data: { label: string; text: string | null }): Promise<ScheduledText | null> {
        const [row] = await this.db.update(scheduledMessageTexts)
            .set(data)
            .where(and(eq(scheduledMessageTexts.id, id), eq(scheduledMessageTexts.company_id, companyId)))
            .returning();
        return row ?? null;
    }

    async deleteText(id: number, companyId: string): Promise<boolean> {
        const [row] = await this.db.delete(scheduledMessageTexts)
            .where(and(eq(scheduledMessageTexts.id, id), eq(scheduledMessageTexts.company_id, companyId)))
            .returning({ id: scheduledMessageTexts.id });
        return !!row;
    }
}
