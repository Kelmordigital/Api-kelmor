"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.campanhaService = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../database/client");
const env_1 = require("../../config/env");
const campanha_db_schema_1 = require("./campanha.db.schema");
const atendimento_db_schema_1 = require("../atendimento/atendimento.db.schema");
/**
 * Defesa em profundidade: o `campaigns` também valida isso, mas o proxy não
 * deve repassar connection_ids/contact_ids de outra empresa mesmo que a
 * validação do outro lado falhe ou fique desatualizada.
 */
async function filterOwnedConnectionIds(companyId, ids) {
    if (ids.length === 0)
        return [];
    const owned = await client_1.db.select({ id: atendimento_db_schema_1.connections.id }).from(atendimento_db_schema_1.connections)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.connections.company_id, companyId), (0, drizzle_orm_1.inArray)(atendimento_db_schema_1.connections.id, ids)));
    return owned.map(o => o.id);
}
async function filterOwnedContactIds(companyId, ids) {
    if (ids.length === 0)
        return [];
    const owned = await client_1.db.select({ id: atendimento_db_schema_1.contacts.id }).from(atendimento_db_schema_1.contacts)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.company_id, companyId), (0, drizzle_orm_1.inArray)(atendimento_db_schema_1.contacts.id, ids)));
    return owned.map(o => o.id);
}
async function campaignsApi(path, init) {
    return fetch(`${env_1.env.CAMPAIGNS_API_URL}${path}`, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': env_1.env.INTERNAL_API_SECRET,
            ...init?.headers,
        },
    });
}
exports.campanhaService = {
    // ── Campanhas — proxy pro microsserviço `campaigns` ─────────────────────
    // Quem persiste, agenda (BullMQ) e efetivamente dispara é o `campaigns`;
    // este serviço só repassa a chamada já validada e escopada por empresa.
    async list(companyId) {
        const res = await campaignsApi(`/campaign?company_id=${companyId}`);
        if (!res.ok)
            throw new Error(`Erro ao listar campanhas (${res.status})`);
        return res.json();
    },
    async create(companyId, payload) {
        const safeConnectionIds = await filterOwnedConnectionIds(companyId, payload.connection_ids);
        const safeContactIds = payload.contact_ids?.length
            ? await filterOwnedContactIds(companyId, payload.contact_ids)
            : payload.contact_ids;
        const res = await campaignsApi('/campaign', {
            method: 'POST',
            body: JSON.stringify({
                company_id: companyId,
                ...payload,
                connection_ids: safeConnectionIds,
                contact_ids: safeContactIds,
            }),
        });
        if (!res.ok)
            throw new Error(`Erro ao criar campanha (${res.status})`);
        return res.json();
    },
    async update(id, companyId, payload) {
        const safeConnectionIds = payload.connection_ids !== undefined
            ? await filterOwnedConnectionIds(companyId, payload.connection_ids)
            : undefined;
        const safeContactIds = payload.contact_ids !== undefined
            ? await filterOwnedContactIds(companyId, payload.contact_ids)
            : undefined;
        await campaignsApi(`/campaign/${id}`, {
            method: 'PUT',
            body: JSON.stringify({
                company_id: companyId,
                ...payload,
                ...(safeConnectionIds !== undefined ? { connection_ids: safeConnectionIds } : {}),
                ...(safeContactIds !== undefined ? { contact_ids: safeContactIds } : {}),
            }),
        });
        return { id };
    },
    async remove(id, companyId) {
        const res = await campaignsApi(`/campaign/${id}?company_id=${companyId}`, { method: 'DELETE' });
        return res.ok;
    },
    async play(id, companyId) {
        const res = await campaignsApi(`/campaign/${id}/play?company_id=${companyId}`, { method: 'POST' });
        return res.ok;
    },
    async pause(id, companyId) {
        const res = await campaignsApi(`/campaign/${id}/pause?company_id=${companyId}`, { method: 'POST' });
        return res.ok;
    },
    // ── Seletores auxiliares (conexões/contatos) — locais, sem relação com o motor de envio ──
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
    // ── Textos de Agendamento — locais, usados no modal do atendimento ──────
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