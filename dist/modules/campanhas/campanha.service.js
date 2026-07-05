"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.campanhaService = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../database/client");
const campanha_db_schema_1 = require("./campanha.db.schema");
const atendimento_db_schema_1 = require("../atendimento/atendimento.db.schema");
const campanha_scheduler_1 = require("./campanha.scheduler");
exports.campanhaService = {
    async list(companyId) {
        const list = await client_1.db.select().from(campanha_db_schema_1.campaigns).where((0, drizzle_orm_1.eq)(campanha_db_schema_1.campaigns.company_id, companyId));
        if (list.length === 0)
            return [];
        const ids = list.map(c => c.id);
        const [connLinks, contactLinks, sentRows] = await Promise.all([
            client_1.db.select().from(campanha_db_schema_1.campaignConnections).where((0, drizzle_orm_1.inArray)(campanha_db_schema_1.campaignConnections.campaign_id, ids)),
            client_1.db.select().from(campanha_db_schema_1.campaignContacts).where((0, drizzle_orm_1.inArray)(campanha_db_schema_1.campaignContacts.campaign_id, ids)),
            client_1.db.select().from(campanha_db_schema_1.campaignSent).where((0, drizzle_orm_1.inArray)(campanha_db_schema_1.campaignSent.campaign_id, ids)),
        ]);
        return list.map(c => ({
            ...c,
            connection_ids: connLinks.filter(l => l.campaign_id === c.id).map(l => l.connection_id),
            contact_ids: contactLinks.filter(l => l.campaign_id === c.id).map(l => l.contact_id),
            sent_count: sentRows.filter(s => s.campaign_id === c.id && s.is_sent).length,
            failed_count: sentRows.filter(s => s.campaign_id === c.id && !s.is_sent).length,
        }));
    },
    async getSelects(companyId) {
        const [conns, cts] = await Promise.all([
            client_1.db.select({ id: atendimento_db_schema_1.connections.id, name: atendimento_db_schema_1.connections.name, status: atendimento_db_schema_1.connections.status })
                .from(atendimento_db_schema_1.connections)
                .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.connections.company_id, companyId)),
            client_1.db.select({ id: atendimento_db_schema_1.contacts.id, name: atendimento_db_schema_1.contacts.name, number: atendimento_db_schema_1.contacts.number })
                .from(atendimento_db_schema_1.contacts)
                .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.company_id, companyId)),
        ]);
        return { connections: conns, contacts: cts };
    },
    async create(companyId, payload) {
        const [campaign] = await client_1.db.insert(campanha_db_schema_1.campaigns).values({
            company_id: companyId,
            title: payload.title,
            message: payload.message,
            type: payload.type ?? 'whatsapp',
            send_date: new Date(payload.send_date),
            timezone: payload.timezone ?? 'America/Sao_Paulo',
            all_contacts: payload.all_contacts ?? false,
        }).returning();
        if (payload.connection_ids.length > 0) {
            await client_1.db.insert(campanha_db_schema_1.campaignConnections).values(payload.connection_ids.map(cid => ({ campaign_id: campaign.id, connection_id: cid })));
        }
        if (!payload.all_contacts && payload.contact_ids?.length) {
            await client_1.db.insert(campanha_db_schema_1.campaignContacts).values(payload.contact_ids.map(cid => ({ campaign_id: campaign.id, contact_id: cid })));
        }
        await (0, campanha_scheduler_1.scheduleCampaign)(campaign.id);
        return campaign;
    },
    async update(id, companyId, payload) {
        const updateData = { updated_at: new Date() };
        if (payload.title !== undefined)
            updateData.title = payload.title;
        if (payload.message !== undefined)
            updateData.message = payload.message;
        if (payload.send_date !== undefined)
            updateData.send_date = new Date(payload.send_date);
        if (payload.timezone !== undefined)
            updateData.timezone = payload.timezone;
        if (payload.all_contacts !== undefined)
            updateData.all_contacts = payload.all_contacts;
        await client_1.db.update(campanha_db_schema_1.campaigns)
            .set(updateData)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(campanha_db_schema_1.campaigns.id, id), (0, drizzle_orm_1.eq)(campanha_db_schema_1.campaigns.company_id, companyId)));
        if (payload.connection_ids !== undefined) {
            await client_1.db.delete(campanha_db_schema_1.campaignConnections).where((0, drizzle_orm_1.eq)(campanha_db_schema_1.campaignConnections.campaign_id, id));
            if (payload.connection_ids.length > 0) {
                await client_1.db.insert(campanha_db_schema_1.campaignConnections).values(payload.connection_ids.map(cid => ({ campaign_id: id, connection_id: cid })));
            }
        }
        if (payload.contact_ids !== undefined) {
            await client_1.db.delete(campanha_db_schema_1.campaignContacts).where((0, drizzle_orm_1.eq)(campanha_db_schema_1.campaignContacts.campaign_id, id));
            if (payload.contact_ids.length > 0) {
                await client_1.db.insert(campanha_db_schema_1.campaignContacts).values(payload.contact_ids.map(cid => ({ campaign_id: id, contact_id: cid })));
            }
        }
        if (payload.send_date !== undefined) {
            (0, campanha_scheduler_1.cancelCampaignTask)(id);
            await (0, campanha_scheduler_1.scheduleCampaign)(id);
        }
        return { id };
    },
    async remove(id, companyId) {
        (0, campanha_scheduler_1.cancelCampaignTask)(id);
        const [row] = await client_1.db.delete(campanha_db_schema_1.campaigns)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(campanha_db_schema_1.campaigns.id, id), (0, drizzle_orm_1.eq)(campanha_db_schema_1.campaigns.company_id, companyId)))
            .returning({ id: campanha_db_schema_1.campaigns.id });
        return !!row;
    },
    async play(id, companyId) {
        const [row] = await client_1.db.update(campanha_db_schema_1.campaigns)
            .set({ is_paused: false, updated_at: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(campanha_db_schema_1.campaigns.id, id), (0, drizzle_orm_1.eq)(campanha_db_schema_1.campaigns.company_id, companyId)))
            .returning({ id: campanha_db_schema_1.campaigns.id });
        if (!row)
            return false;
        await (0, campanha_scheduler_1.resumeCampaign)(id);
        return true;
    },
    async pause(id, companyId) {
        const [row] = await client_1.db.update(campanha_db_schema_1.campaigns)
            .set({ is_paused: true, is_running: false, is_sending: false, updated_at: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(campanha_db_schema_1.campaigns.id, id), (0, drizzle_orm_1.eq)(campanha_db_schema_1.campaigns.company_id, companyId)))
            .returning({ id: campanha_db_schema_1.campaigns.id });
        if (!row)
            return false;
        (0, campanha_scheduler_1.cancelCampaignTask)(id);
        return true;
    },
    // ── Scheduled Message Texts ───────────────────────────────────────────────
    async listTexts(companyId) {
        const existing = await client_1.db.select().from(campanha_db_schema_1.scheduledMessageTexts)
            .where((0, drizzle_orm_1.eq)(campanha_db_schema_1.scheduledMessageTexts.company_id, companyId));
        const existingTypes = new Set(existing.map(t => t.type));
        const defaults = [
            { type: 1, label: 'Recorrência', text: 'Olá! Passando para avisar que o seu medicamento contínuo pode estar acabando. Podemos separar para você?' },
            { type: 2, label: 'Pós-venda/Antibiótico', text: 'Olá! Como está se sentindo? Passando para acompanhar o seu tratamento com o antibiótico.' },
            { type: 3, label: 'Suplementação', text: 'Olá! O seu suplemento pode estar no fim. Posso verificar a disponibilidade para você?' },
            { type: 4, label: 'Personalizar', text: '' },
        ];
        const missing = defaults.filter(d => !existingTypes.has(d.type));
        if (missing.length > 0) {
            await client_1.db.insert(campanha_db_schema_1.scheduledMessageTexts).values(missing.map(d => ({ company_id: companyId, ...d })));
            return client_1.db.select().from(campanha_db_schema_1.scheduledMessageTexts)
                .where((0, drizzle_orm_1.eq)(campanha_db_schema_1.scheduledMessageTexts.company_id, companyId));
        }
        return existing;
    },
    async upsertText(companyId, payload) {
        const [result] = await client_1.db.insert(campanha_db_schema_1.scheduledMessageTexts)
            .values({ company_id: companyId, label: payload.label, text: payload.text, type: payload.type })
            .onConflictDoUpdate({
            target: [campanha_db_schema_1.scheduledMessageTexts.company_id, campanha_db_schema_1.scheduledMessageTexts.type],
            set: { label: payload.label, text: payload.text },
        })
            .returning();
        return result;
    },
    async updateText(id, companyId, payload) {
        const [result] = await client_1.db.update(campanha_db_schema_1.scheduledMessageTexts)
            .set({ label: payload.label, text: payload.text })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(campanha_db_schema_1.scheduledMessageTexts.id, id), (0, drizzle_orm_1.eq)(campanha_db_schema_1.scheduledMessageTexts.company_id, companyId)))
            .returning();
        return result ?? null;
    },
    async removeText(id, companyId) {
        const [row] = await client_1.db.delete(campanha_db_schema_1.scheduledMessageTexts)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(campanha_db_schema_1.scheduledMessageTexts.id, id), (0, drizzle_orm_1.eq)(campanha_db_schema_1.scheduledMessageTexts.company_id, companyId)))
            .returning({ id: campanha_db_schema_1.scheduledMessageTexts.id });
        return !!row;
    },
};
//# sourceMappingURL=campanha.service.js.map