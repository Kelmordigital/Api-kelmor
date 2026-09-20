import { describe, it, expect, beforeAll } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { connections, contacts, tickets } from '../../src/modules/atendimento/atendimento.db.schema';
import { whatsappService } from '../../src/modules/whatsapp/whatsapp.service';

/**
 * O Baileys reporta tanto o eco do NOSSO envio (despedida, saudação de fila,
 * mensagem mandada pela tela do CRM) quanto mensagem digitada de verdade no
 * celular, fora do sistema, como o mesmo evento "mensagem recebida"
 * (message-upsert com fromMe:true) — o eco de envio próprio já é filtrado
 * antes de chegar aqui pelo dedup de cache do Baileys (messageListenerService.ts),
 * então o que sobra sendo fromMe:true é mensagem externa de verdade e deve
 * criar um ticket novo igual a uma mensagem de cliente (nunca reabre um fechado).
 */

const SUFFIX = Date.now();
let companyId: string;
let connectionId: number;

beforeAll(async () => {
    const [co] = await db.insert(companies)
        .values({ name: `Empresa Webhook FromMe ${SUFFIX}`, status: true })
        .returning({ id: companies.id });
    companyId = co.id;

    const [conn] = await db.insert(connections)
        .values({ company_id: companyId, name: 'Conexão Teste', type: 'whatsapp', status: 'connected' })
        .returning({ id: connections.id });
    connectionId = conn.id;
});

async function ticketsForPhone(phone: string) {
    const [contact] = await db.select().from(contacts)
        .where(and(eq(contacts.company_id, companyId), eq(contacts.number, phone)));
    if (!contact) return [];
    return db.select().from(tickets).where(eq(tickets.contact_id, contact.id));
}

describe('whatsappService.handleMessagesWebhook — eco de mensagem própria (fromMe)', () => {
    it('cria ticket novo quando fromMe:true (mensagem externa) e não existe ticket aberto pro contato', async () => {
        const phone = `55119${SUFFIX}1`;
        await whatsappService.handleMessagesWebhook(connectionId, {
            data: {
                key: { remoteJid: `${phone}@s.whatsapp.net`, fromMe: true, id: `ECHO-${SUFFIX}` },
                message: { conversation: 'cachorro' },
                messageTimestamp: Math.floor(Date.now() / 1000),
                pushName: 'Dono da Conexão',
            },
        });

        const found = await ticketsForPhone(phone);
        expect(found).toHaveLength(1);
    });

    it('NÃO reabre ticket fechado quando fromMe:true — cria um novo em vez disso', async () => {
        const phone = `55119${SUFFIX}3`;
        const [contact] = await db.insert(contacts)
            .values({ company_id: companyId, number: phone, name: 'Contato Fechado' })
            .returning();
        const [closedTicket] = await db.insert(tickets)
            .values({
                company_id: companyId,
                contact_id: contact.id,
                connection_id: connectionId,
                status_id: 3,
                serialized_id: `${phone}@s.whatsapp.net`,
            })
            .returning();

        await whatsappService.handleMessagesWebhook(connectionId, {
            data: {
                key: { remoteJid: `${phone}@s.whatsapp.net`, fromMe: true, id: `ECHO2-${SUFFIX}` },
                message: { conversation: 'seguindo por fora' },
                messageTimestamp: Math.floor(Date.now() / 1000),
                pushName: 'Dono da Conexão',
            },
        });

        const found = await ticketsForPhone(phone);
        expect(found).toHaveLength(2);
        const reopenedClosed = found.find((t) => t.id === closedTicket.id);
        expect(reopenedClosed?.status_id).toBe(3);
    });

    it('cria ticket normalmente quando a mensagem é do cliente (fromMe:false)', async () => {
        const phone = `55119${SUFFIX}2`;
        await whatsappService.handleMessagesWebhook(connectionId, {
            data: {
                key: { remoteJid: `${phone}@s.whatsapp.net`, fromMe: false, id: `CLIENTE-${SUFFIX}` },
                message: { conversation: 'oi, preciso de ajuda' },
                messageTimestamp: Math.floor(Date.now() / 1000),
                pushName: 'Cliente Teste',
            },
        });

        const found = await ticketsForPhone(phone);
        expect(found).toHaveLength(1);
    });
});
