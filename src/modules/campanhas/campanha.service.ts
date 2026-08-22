import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../../database/client';
import {
    campaigns, campaignConnections, campaignContacts, campaignSent, scheduledMessageTexts,
} from './campanha.db.schema';
import { connections, contacts } from '../atendimento/atendimento.db.schema';
import { scheduleCampaign, cancelCampaignTask, resumeCampaign } from './campanha.scheduler';

// Restringe os ids recebidos do cliente aos que realmente pertencem à
// empresa — sem isso, uma empresa poderia vincular campanhas à conexão
// WhatsApp ou à base de contatos de outra empresa só enviando o id.
async function filterOwnedConnectionIds(companyId: string, ids: number[]): Promise<number[]> {
    if (ids.length === 0) return [];
    const owned = await db.select({ id: connections.id }).from(connections)
        .where(and(eq(connections.company_id, companyId), inArray(connections.id, ids)));
    return owned.map(o => o.id);
}

async function filterOwnedContactIds(companyId: string, ids: number[]): Promise<number[]> {
    if (ids.length === 0) return [];
    const owned = await db.select({ id: contacts.id }).from(contacts)
        .where(and(eq(contacts.company_id, companyId), inArray(contacts.id, ids)));
    return owned.map(o => o.id);
}

export const campanhaService = {

    async list(companyId: string) {
        const list = await db.select().from(campaigns).where(eq(campaigns.company_id, companyId));
        if (list.length === 0) return [];

        const ids = list.map(c => c.id);
        const [connLinks, contactLinks, sentRows] = await Promise.all([
            db.select().from(campaignConnections).where(inArray(campaignConnections.campaign_id, ids)),
            db.select().from(campaignContacts).where(inArray(campaignContacts.campaign_id, ids)),
            db.select().from(campaignSent).where(inArray(campaignSent.campaign_id, ids)),
        ]);

        return list.map(c => ({
            ...c,
            connection_ids: connLinks.filter(l => l.campaign_id === c.id).map(l => l.connection_id),
            contact_ids:    contactLinks.filter(l => l.campaign_id === c.id).map(l => l.contact_id),
            sent_count:     sentRows.filter(s => s.campaign_id === c.id && s.is_sent).length,
            failed_count:   sentRows.filter(s => s.campaign_id === c.id && !s.is_sent).length,
        }));
    },

    async getSelects(companyId: string) {
        const [conns, cts] = await Promise.all([
            db.select({ id: connections.id, name: connections.name, status: connections.status })
                .from(connections)
                .where(eq(connections.company_id, companyId)),
            db.select({ id: contacts.id, name: contacts.name, number: contacts.number })
                .from(contacts)
                .where(eq(contacts.company_id, companyId)),
        ]);
        return { connections: conns, contacts: cts };
    },

    async create(companyId: string, payload: {
        title: string;
        message: string;
        type?: string;
        send_date: string;
        timezone?: string;
        all_contacts?: boolean;
        connection_ids: number[];
        contact_ids?: number[];
    }) {
        const [campaign] = await db.insert(campaigns).values({
            company_id:   companyId,
            title:        payload.title,
            message:      payload.message,
            type:         payload.type ?? 'whatsapp',
            send_date:    new Date(payload.send_date),
            timezone:     payload.timezone ?? 'America/Sao_Paulo',
            all_contacts: payload.all_contacts ?? false,
        }).returning();

        const safeConnectionIds = await filterOwnedConnectionIds(companyId, payload.connection_ids);
        if (safeConnectionIds.length > 0) {
            await db.insert(campaignConnections).values(
                safeConnectionIds.map(cid => ({ campaign_id: campaign.id, connection_id: cid }))
            );
        }

        if (!payload.all_contacts && payload.contact_ids?.length) {
            const safeContactIds = await filterOwnedContactIds(companyId, payload.contact_ids);
            if (safeContactIds.length > 0) {
                await db.insert(campaignContacts).values(
                    safeContactIds.map(cid => ({ campaign_id: campaign.id, contact_id: cid }))
                );
            }
        }

        await scheduleCampaign(campaign.id);

        return campaign;
    },

    async update(id: number, companyId: string, payload: {
        title?: string;
        message?: string;
        send_date?: string;
        timezone?: string;
        all_contacts?: boolean;
        connection_ids?: number[];
        contact_ids?: number[];
    }) {
        // Confirma que a campanha é da própria empresa ANTES de mexer nas
        // tabelas de junção — sem isso, o update em `campaigns` (corretamente
        // escopado) simplesmente não afeta nenhuma linha, mas o código seguia
        // e reescrevia campaignConnections/campaignContacts de uma campanha
        // de outra empresa mesmo assim, usando só o `id` cru.
        const [owned] = await db.select({ id: campaigns.id })
            .from(campaigns)
            .where(and(eq(campaigns.id, id), eq(campaigns.company_id, companyId)))
            .limit(1);
        if (!owned) return null;

        const updateData: Record<string, unknown> = { updated_at: new Date() };
        if (payload.title        !== undefined) updateData.title        = payload.title;
        if (payload.message      !== undefined) updateData.message      = payload.message;
        if (payload.send_date    !== undefined) updateData.send_date    = new Date(payload.send_date);
        if (payload.timezone     !== undefined) updateData.timezone     = payload.timezone;
        if (payload.all_contacts !== undefined) updateData.all_contacts = payload.all_contacts;

        await db.update(campaigns)
            .set(updateData)
            .where(eq(campaigns.id, id));

        if (payload.connection_ids !== undefined) {
            await db.delete(campaignConnections).where(eq(campaignConnections.campaign_id, id));
            const safeConnectionIds = await filterOwnedConnectionIds(companyId, payload.connection_ids);
            if (safeConnectionIds.length > 0) {
                await db.insert(campaignConnections).values(
                    safeConnectionIds.map(cid => ({ campaign_id: id, connection_id: cid }))
                );
            }
        }

        if (payload.contact_ids !== undefined) {
            await db.delete(campaignContacts).where(eq(campaignContacts.campaign_id, id));
            const safeContactIds = await filterOwnedContactIds(companyId, payload.contact_ids);
            if (safeContactIds.length > 0) {
                await db.insert(campaignContacts).values(
                    safeContactIds.map(cid => ({ campaign_id: id, contact_id: cid }))
                );
            }
        }

        if (payload.send_date !== undefined) {
            cancelCampaignTask(id);
            await scheduleCampaign(id);
        }

        return { id };
    },

    async remove(id: number, companyId: string): Promise<boolean> {
        cancelCampaignTask(id);
        const [row] = await db.delete(campaigns)
            .where(and(eq(campaigns.id, id), eq(campaigns.company_id, companyId)))
            .returning({ id: campaigns.id });
        return !!row;
    },

    async play(id: number, companyId: string): Promise<boolean> {
        const [row] = await db.update(campaigns)
            .set({ is_paused: false, updated_at: new Date() })
            .where(and(eq(campaigns.id, id), eq(campaigns.company_id, companyId)))
            .returning({ id: campaigns.id });
        if (!row) return false;

        await resumeCampaign(id);
        return true;
    },

    async pause(id: number, companyId: string): Promise<boolean> {
        const [row] = await db.update(campaigns)
            .set({ is_paused: true, is_running: false, is_sending: false, updated_at: new Date() })
            .where(and(eq(campaigns.id, id), eq(campaigns.company_id, companyId)))
            .returning({ id: campaigns.id });
        if (!row) return false;

        cancelCampaignTask(id);
        return true;
    },

    // ── Scheduled Message Texts ───────────────────────────────────────────────

    async listTexts(companyId: string) {
        const existing = await db.select().from(scheduledMessageTexts)
            .where(eq(scheduledMessageTexts.company_id, companyId));

        const existingTypes = new Set(existing.map(t => t.type));
        const defaults = [
            { type: 1, label: 'Recorrência',           text: 'Olá! Passando para avisar que o seu medicamento contínuo pode estar acabando. Podemos separar para você?' },
            { type: 2, label: 'Pós-venda/Antibiótico', text: 'Olá! Como está se sentindo? Passando para acompanhar o seu tratamento com o antibiótico.' },
            { type: 3, label: 'Suplementação',          text: 'Olá! O seu suplemento pode estar no fim. Posso verificar a disponibilidade para você?' },
            { type: 4, label: 'Personalizar',           text: '' },
        ];

        const missing = defaults.filter(d => !existingTypes.has(d.type));
        if (missing.length > 0) {
            await db.insert(scheduledMessageTexts).values(
                missing.map(d => ({ company_id: companyId, ...d }))
            );
            return db.select().from(scheduledMessageTexts)
                .where(eq(scheduledMessageTexts.company_id, companyId));
        }

        return existing;
    },

    async upsertText(companyId: string, payload: { label: string; text?: string; type: number }) {
        const [result] = await db.insert(scheduledMessageTexts)
            .values({ company_id: companyId, label: payload.label, text: payload.text, type: payload.type })
            .onConflictDoUpdate({
                target: [scheduledMessageTexts.company_id, scheduledMessageTexts.type],
                set: { label: payload.label, text: payload.text },
            })
            .returning();
        return result;
    },

    async updateText(id: number, companyId: string, payload: { label: string; text?: string }) {
        const [result] = await db.update(scheduledMessageTexts)
            .set({ label: payload.label, text: payload.text })
            .where(and(eq(scheduledMessageTexts.id, id), eq(scheduledMessageTexts.company_id, companyId)))
            .returning();
        return result ?? null;
    },

    async removeText(id: number, companyId: string): Promise<boolean> {
        const [row] = await db.delete(scheduledMessageTexts)
            .where(and(eq(scheduledMessageTexts.id, id), eq(scheduledMessageTexts.company_id, companyId)))
            .returning({ id: scheduledMessageTexts.id });
        return !!row;
    },
};