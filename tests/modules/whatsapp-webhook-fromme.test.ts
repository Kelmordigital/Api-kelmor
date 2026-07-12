import { describe, it, expect, beforeAll } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { connections, contacts, tickets } from '../../src/modules/atendimento/atendimento.db.schema';
import { whatsappService } from '../../src/modules/whatsapp/whatsapp.service';

/**
 * Reproduz o bug: o Baileys reporta o PRÓPRIO envio da gente (despedida,
 * saudação de fila, etc.) de volta como um evento de "mensagem recebida"
 * (message-upsert com fromMe:true). Isso não deve nunca criar um ticket
 * novo do zero — só faz sentido anexar a um ticket já aberto, se existir.
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
    it('NÃO cria ticket novo quando fromMe:true e não existe ticket aberto pro contato', async () => {
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
        expect(found).toHaveLength(0);
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
