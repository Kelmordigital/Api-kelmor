import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import {
    contacts,
    connections,
    tickets,
    atendimento_messages,
} from '../../src/modules/atendimento/atendimento.db.schema';
import { whatsappService } from '../../src/modules/whatsapp/whatsapp.service';

/**
 * Valida o suporte a LID / usernames do WhatsApp (Meta 2026) ponta a ponta,
 * exercitando o webhook real de entrada (handleMessagesWebhook) contra o banco.
 */

const LID = '205939420483821';          // <id>@lid — contato sem número
const NUMERO = '5511988887777';         // número real revelado depois

let companyId: string;
let connectionId: number;

/** Monta um payload cru no formato que o Baileys envia para o webhook do API-04. */
function waPayload(opts: {
    remoteJid: string;
    senderPn?: string;
    text: string;
    pushName?: string;
    contactUsername?: string;
}) {
    return {
        data: {
            key: {
                id: `MSG_${Math.random().toString(36).slice(2)}`,
                remoteJid: opts.remoteJid,
                fromMe: false,
                ...(opts.senderPn ? { sender_pn: opts.senderPn } : {}),
            },
            pushName: opts.pushName ?? 'Cliente Username',
            ...(opts.contactUsername ? { contactUsername: opts.contactUsername } : {}),
            message: { conversation: opts.text },
        },
    };
}

async function contatosComLid(lid: string) {
    return db.select().from(contacts).where(
        and(eq(contacts.company_id, companyId), eq(contacts.lid, lid)),
    );
}

beforeAll(async () => {
    const [co] = await db.insert(companies)
        .values({ name: 'Empresa LID Teste', status: true })
        .returning({ id: companies.id });
    companyId = co.id;

    const [conn] = await db.insert(connections)
        .values({ company_id: companyId, name: 'Conexão Teste', status: 'connected' })
        .returning({ id: connections.id });
    connectionId = conn.id;
});

beforeEach(async () => {
    // Limpa dados transacionais entre cenários (mantém company + connection)
    await db.delete(atendimento_messages);
    await db.delete(tickets).where(eq(tickets.company_id, companyId));
    await db.delete(contacts).where(eq(contacts.company_id, companyId));
});

describe('WhatsApp LID / Username — fluxo de entrada', () => {
    it('1) mensagem @lid SEM número cria contato LID-only (number null) + ticket + mensagem', async () => {
        await whatsappService.handleMessagesWebhook(
            connectionId,
            waPayload({ remoteJid: `${LID}@lid`, text: 'Olá, vim pelo username' }),
        );

        const [c] = await contatosComLid(LID);
        expect(c).toBeTruthy();
        expect(c.number).toBeNull();          // sem número — antes isso era descartado
        expect(c.lid).toBe(LID);

        const tks = await db.select().from(tickets).where(eq(tickets.contact_id, c.id));
        expect(tks.length).toBe(1);

        const msgs = await db.select().from(atendimento_messages)
            .where(eq(atendimento_messages.ticket_id, tks[0].id));
        expect(msgs.length).toBe(1);
        expect(msgs[0].body).toContain('username');
    });

    it('2) quando o número é revelado depois, o contato LID-only é atualizado (upgrade) sem duplicar', async () => {
        // 1ª mensagem: só LID
        await whatsappService.handleMessagesWebhook(
            connectionId,
            waPayload({ remoteJid: `${LID}@lid`, text: 'primeira, sem número' }),
        );
        // 2ª mensagem: mesmo LID, agora com número (sender_pn)
        await whatsappService.handleMessagesWebhook(
            connectionId,
            waPayload({
                remoteJid: `${LID}@lid`,
                senderPn: `${NUMERO}@s.whatsapp.net`,
                text: 'segunda, número revelado',
            }),
        );

        const comLid = await contatosComLid(LID);
        expect(comLid.length).toBe(1);              // não duplicou
        expect(comLid[0].number).toBe(NUMERO);      // upgrade: número preenchido
        expect(comLid[0].lid).toBe(LID);
    });

    it('3) contato canônico (com número) + LID-only separado → merge ao chegar número+LID juntos', async () => {
        // Canônico: mensagem normal com número, sem LID
        await whatsappService.handleMessagesWebhook(
            connectionId,
            waPayload({ remoteJid: `${NUMERO}@s.whatsapp.net`, text: 'sou o canônico' }),
        );
        // LID-only: mensagem via username, sem número
        await whatsappService.handleMessagesWebhook(
            connectionId,
            waPayload({ remoteJid: `${LID}@lid`, text: 'sou o lid-only' }),
        );

        // Sanidade: 2 contatos distintos antes do merge
        const antes = await db.select().from(contacts).where(eq(contacts.company_id, companyId));
        expect(antes.length).toBe(2);

        // Mensagem que vincula os dois (número + LID)
        await whatsappService.handleMessagesWebhook(
            connectionId,
            waPayload({
                remoteJid: `${LID}@lid`,
                senderPn: `${NUMERO}@s.whatsapp.net`,
                text: 'agora vinculado',
            }),
        );

        // Só sobra o canônico, agora com número E lid
        const depois = await db.select().from(contacts).where(eq(contacts.company_id, companyId));
        expect(depois.length).toBe(1);
        expect(depois[0].number).toBe(NUMERO);
        expect(depois[0].lid).toBe(LID);

        // Tickets do LID-only foram reatribuídos ao canônico (nenhum ticket órfão)
        const tks = await db.select().from(tickets).where(eq(tickets.company_id, companyId));
        for (const t of tks) {
            expect(t.contact_id).toBe(depois[0].id);
        }
    });

    it('4) username público é gravado em wa_username quando presente no payload', async () => {
        await whatsappService.handleMessagesWebhook(
            connectionId,
            waPayload({
                remoteJid: `${LID}@lid`,
                text: 'oi',
                contactUsername: 'joao.silva',
            }),
        );

        const [c] = await contatosComLid(LID);
        expect(c.wa_username).toBe('joao.silva');
    });
});
