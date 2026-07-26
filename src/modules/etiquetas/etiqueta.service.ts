import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { db } from '../../database/client';
import { etiquetas, contactEtiquetas, automaticTagRules, automaticTagRuleTags, Etiqueta, NewEtiqueta } from './etiqueta.db.schema';
import { companyPermissions } from '../configuracao-geral/configuracao-geral.db.schema';

export const etiquetaService = {

    async list(companyId: string): Promise<Etiqueta[]> {
        return db
            .select()
            .from(etiquetas)
            .where(eq(etiquetas.company_id, companyId))
            .orderBy(desc(etiquetas.created_at));
    },

    async findById(id: string, companyId: string): Promise<Etiqueta | null> {
        const [row] = await db
            .select()
            .from(etiquetas)
            .where(and(eq(etiquetas.id, id), eq(etiquetas.company_id, companyId)))
            .limit(1);
        return row ?? null;
    },

    async create(companyId: string, payload: Omit<NewEtiqueta, 'id' | 'company_id' | 'created_at' | 'updated_at'>): Promise<Etiqueta> {
        const [row] = await db
            .insert(etiquetas)
            .values({ ...payload, company_id: companyId })
            .returning();
        return row;
    },

    async update(id: string, companyId: string, payload: Partial<Pick<Etiqueta, 'name' | 'color' | 'icon'>>): Promise<Etiqueta | null> {
        const [row] = await db
            .update(etiquetas)
            .set({ ...payload, updated_at: new Date() })
            .where(and(eq(etiquetas.id, id), eq(etiquetas.company_id, companyId)))
            .returning();
        return row ?? null;
    },

    async remove(id: string, companyId: string): Promise<boolean> {
        const [row] = await db
            .delete(etiquetas)
            .where(and(eq(etiquetas.id, id), eq(etiquetas.company_id, companyId)))
            .returning();
        return !!row;
    },

    async getStats(companyId: string) {
        const list = await etiquetaService.list(companyId);
        const today = new Date();

        const stats = await Promise.all(list.map(async (et) => {
            const total = await db
                .select({ count: sql<number>`count(*)::int` })
                .from(contactEtiquetas)
                .where(eq(contactEtiquetas.etiqueta_id, et.id))
                .then(r => r[0]?.count ?? 0);

            // Série dos últimos 7 dias
            const series = Array.from({ length: 7 }, (_, i) => {
                const d = new Date(today);
                d.setDate(d.getDate() - (6 - i));
                return { date: d.toISOString().slice(0, 10), count: 0 };
            });

            return {
                etiqueta_id: et.id,
                name: et.name,
                color: et.color,
                total_leads: total,
                series,
            };
        }));

        return stats;
    },

    async aplicarAoContato(contactId: string, etiquetaId: string, companyId: string): Promise<void> {
        const et = await etiquetaService.findById(etiquetaId, companyId);
        if (!et) throw new Error('Etiqueta não encontrada');
        await db
            .insert(contactEtiquetas)
            .values({ contact_id: contactId, etiqueta_id: etiquetaId })
            .onConflictDoNothing();
    },

    async removerDoContato(contactId: string, etiquetaId: string): Promise<void> {
        await db
            .delete(contactEtiquetas)
            .where(and(
                eq(contactEtiquetas.contact_id, contactId),
                eq(contactEtiquetas.etiqueta_id, etiquetaId),
            ));
    },

    async listDoContato(contactId: string): Promise<Etiqueta[]> {
        const rows = await db
            .select({ etiqueta: etiquetas })
            .from(contactEtiquetas)
            .innerJoin(etiquetas, eq(contactEtiquetas.etiqueta_id, etiquetas.id))
            .where(eq(contactEtiquetas.contact_id, contactId));
        return rows.map(r => r.etiqueta);
    },
};

/**
 * Etiquetamento automático: casa o texto de uma mensagem contra as regras
 * (at_automatic_tag_rules) cadastradas pela empresa. Cada regra tem uma
 * lista de variações de palavra-chave separadas por vírgula (ex: "fralda,
 * frauda, fraldinha") — qualquer uma delas ativa a regra — e pode apontar
 * para múltiplas etiquetas. Idempotente via ON CONFLICT DO NOTHING em
 * aplicarAoContato.
 */
export async function matchAndApplyAutomaticTags(
    companyId: string,
    contactId: number,
    messageText: string,
): Promise<void> {
    const [perm] = await db
        .select({ enable_automatic_tags: companyPermissions.enable_automatic_tags })
        .from(companyPermissions)
        .where(eq(companyPermissions.company_id, companyId))
        .limit(1);

    if (!perm?.enable_automatic_tags) return;

    const rules = await db
        .select()
        .from(automaticTagRules)
        .where(eq(automaticTagRules.company_id, companyId));

    if (!rules.length) return;

    const lowerText = messageText.toLowerCase();

    const matchedRuleIds = rules
        .filter(rule => rule.keywords
            .split(',')
            .map((k: string) => k.trim().toLowerCase())
            .filter(Boolean)
            .some((kw: string) => lowerText.includes(kw)))
        .map(rule => rule.id);

    if (!matchedRuleIds.length) return;

    const tagRows = await db
        .select({ etiqueta_id: automaticTagRuleTags.etiqueta_id })
        .from(automaticTagRuleTags)
        .where(inArray(automaticTagRuleTags.rule_id, matchedRuleIds));

    const uniqueTagIds = [...new Set(tagRows.map(r => r.etiqueta_id))];

    for (const etiquetaId of uniqueTagIds) {
        await etiquetaService.aplicarAoContato(String(contactId), etiquetaId, companyId);
    }
}
