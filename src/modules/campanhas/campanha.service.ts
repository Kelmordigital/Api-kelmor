import { eq, and } from 'drizzle-orm';
import { db } from '../../database/client';
import { env } from '../../config/env';
import { scheduledMessageTexts } from './campanha.db.schema';
import { connections, contacts } from '../atendimento/atendimento.db.schema';

async function campaignsApi(path: string, init?: RequestInit): Promise<Response> {
    return fetch(`${env.CAMPAIGNS_API_URL}${path}`, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': env.INTERNAL_API_SECRET,
            ...init?.headers,
        },
    });
}

export const campanhaService = {

    // ── Campanhas — proxy pro microsserviço `campaigns` ─────────────────────
    // Quem persiste, agenda (BullMQ) e efetivamente dispara é o `campaigns`;
    // este serviço só repassa a chamada já validada e escopada por empresa.

    async list(companyId: string) {
        const res = await campaignsApi(`/campaign?company_id=${companyId}`);
        if (!res.ok) throw new Error(`Erro ao listar campanhas (${res.status})`);
        return res.json();
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
        const res = await campaignsApi('/campaign', {
            method: 'POST',
            body: JSON.stringify({ company_id: companyId, ...payload }),
        });
        if (!res.ok) throw new Error(`Erro ao criar campanha (${res.status})`);
        return res.json();
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
        await campaignsApi(`/campaign/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ company_id: companyId, ...payload }),
        });
        return { id };
    },

    async remove(id: number, companyId: string): Promise<boolean> {
        const res = await campaignsApi(`/campaign/${id}?company_id=${companyId}`, { method: 'DELETE' });
        return res.ok;
    },

    async play(id: number, companyId: string): Promise<boolean> {
        const res = await campaignsApi(`/campaign/${id}/play?company_id=${companyId}`, { method: 'POST' });
        return res.ok;
    },

    async pause(id: number, companyId: string): Promise<boolean> {
        const res = await campaignsApi(`/campaign/${id}/pause?company_id=${companyId}`, { method: 'POST' });
        return res.ok;
    },

    // ── Seletores auxiliares (conexões/contatos) — locais, sem relação com o motor de envio ──

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

    // ── Textos de Agendamento — locais, usados no modal do atendimento ──────

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
