import { eq, and, desc, gte, inArray, sql } from 'drizzle-orm';
import type { DB } from '../../database/client';
import { etiquetas, contactEtiquetas, Etiqueta, NewEtiqueta } from './etiqueta.db.schema';
import { brLocal } from '../../core/dates/br-day';

export type EtiquetaData  = Omit<NewEtiqueta, 'id' | 'company_id' | 'created_at' | 'updated_at'>;
export type EtiquetaPatch = Partial<Pick<Etiqueta, 'name' | 'color' | 'icon'>>;

export interface TagUsage {
    /** Contatos com a etiqueta, ao todo. */
    totals: Map<string, number>;
    /** Aplicações por dia (YYYY-MM-DD) desde `since`. */
    daily: Map<string, Map<string, number>>;
}

export interface EtiquetaRepository {
    listByCompany(companyId: string): Promise<Etiqueta[]>;
    findById(id: string, companyId: string): Promise<Etiqueta | null>;
    create(companyId: string, data: EtiquetaData): Promise<Etiqueta>;
    update(id: string, companyId: string, patch: EtiquetaPatch): Promise<Etiqueta | null>;
    delete(id: string, companyId: string): Promise<boolean>;
    /** Idempotente: aplicar de novo não duplica. */
    linkToContact(contactId: number, etiquetaId: string): Promise<void>;
    unlinkFromContact(contactId: number, etiquetaId: string): Promise<void>;
    listForContact(contactId: number, companyId: string): Promise<Etiqueta[]>;
    usage(etiquetaIds: string[], since: Date): Promise<TagUsage>;
}

export class DrizzleEtiquetaRepository implements EtiquetaRepository {
    constructor(private readonly db: DB) {}

    listByCompany(companyId: string): Promise<Etiqueta[]> {
        return this.db.select().from(etiquetas)
            .where(eq(etiquetas.company_id, companyId))
            .orderBy(desc(etiquetas.created_at));
    }

    async findById(id: string, companyId: string): Promise<Etiqueta | null> {
        const [row] = await this.db.select().from(etiquetas).where(this.byIdInCompany(id, companyId)).limit(1);
        return row ?? null;
    }

    async create(companyId: string, data: EtiquetaData): Promise<Etiqueta> {
        const [row] = await this.db.insert(etiquetas).values({ ...data, company_id: companyId }).returning();
        return row;
    }

    async update(id: string, companyId: string, patch: EtiquetaPatch): Promise<Etiqueta | null> {
        const [row] = await this.db.update(etiquetas)
            .set({ ...patch, updated_at: new Date() })
            .where(this.byIdInCompany(id, companyId))
            .returning();
        return row ?? null;
    }

    async delete(id: string, companyId: string): Promise<boolean> {
        const [row] = await this.db.delete(etiquetas).where(this.byIdInCompany(id, companyId)).returning({ id: etiquetas.id });
        return !!row;
    }

    // contact_id é varchar (aceita ids de leads antigos); contatos numéricos viram texto
    async linkToContact(contactId: number, etiquetaId: string): Promise<void> {
        await this.db.insert(contactEtiquetas)
            .values({ contact_id: String(contactId), etiqueta_id: etiquetaId })
            .onConflictDoNothing();
    }

    async unlinkFromContact(contactId: number, etiquetaId: string): Promise<void> {
        await this.db.delete(contactEtiquetas)
            .where(and(eq(contactEtiquetas.contact_id, String(contactId)), eq(contactEtiquetas.etiqueta_id, etiquetaId)));
    }

    async listForContact(contactId: number, companyId: string): Promise<Etiqueta[]> {
        const rows = await this.db.select({ etiqueta: etiquetas })
            .from(contactEtiquetas)
            .innerJoin(etiquetas, eq(contactEtiquetas.etiqueta_id, etiquetas.id))
            .where(and(eq(contactEtiquetas.contact_id, String(contactId)), eq(etiquetas.company_id, companyId)));
        return rows.map((r) => r.etiqueta);
    }

    async usage(etiquetaIds: string[], since: Date): Promise<TagUsage> {
        const usage: TagUsage = { totals: new Map(), daily: new Map() };
        if (etiquetaIds.length === 0) return usage;

        const day = sql<string>`to_char(${brLocal(contactEtiquetas.created_at)}, 'YYYY-MM-DD')`;
        const [totals, daily] = await Promise.all([
            this.db.select({ id: contactEtiquetas.etiqueta_id, total: sql<number>`count(*)::int` })
                .from(contactEtiquetas)
                .where(inArray(contactEtiquetas.etiqueta_id, etiquetaIds))
                .groupBy(contactEtiquetas.etiqueta_id),
            this.db.select({ id: contactEtiquetas.etiqueta_id, day, total: sql<number>`count(*)::int` })
                .from(contactEtiquetas)
                .where(and(inArray(contactEtiquetas.etiqueta_id, etiquetaIds), gte(contactEtiquetas.created_at, since)))
                .groupBy(contactEtiquetas.etiqueta_id, day),
        ]);

        for (const row of totals) usage.totals.set(row.id, row.total);
        for (const row of daily) {
            const byDay = usage.daily.get(row.id) ?? new Map<string, number>();
            byDay.set(row.day, row.total);
            usage.daily.set(row.id, byDay);
        }
        return usage;
    }

    private byIdInCompany(id: string, companyId: string) {
        return and(eq(etiquetas.id, id), eq(etiquetas.company_id, companyId));
    }
}
