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
 * Nome de exibição do contato × pushName (bug dos contatos "Filipe Oliveira").
 *
 * pushName é o nome do AUTOR da mensagem: em mensagens fromMe ele é o nome do
 * dono da conexão, nunca do contato. Usá-lo na criação fazia todo contato cuja
 * primeira mensagem processada era fromMe nascer com o nome do dono.
 */

const DONO = 'Dono Da Conexao';       // pushName do dono (vem em toda msg fromMe)
const CLIENTE = 'Maria Cliente';      // pushName real do contato
const NUMERO = '5564981112233';
const LID = '309876543210001';

let companyId: string;
let connectionId: number;

/** Payload cru no formato que o Baileys envia para o webhook do API-04. */
function waPayload(opts: {
    remoteJid: string;
    text: string;
    fromMe?: boolean;
    pushName?: string;
    senderPn?: string;
}) {
    return {
        data: {
            key: {
                id: `MSG_${Math.random().toString(36).slice(2)}`,
                remoteJid: opts.remoteJid,
                fromMe: opts.fromMe ?? false,
                ...(opts.senderPn ? { sender_pn: opts.senderPn } : {}),
            },
            ...(opts.pushName ? { pushName: opts.pushName } : {}),
            message: { conversation: opts.text },
        },
    };
}

async function contatoPorNumero(numero: string) {
    const [c] = await db.select().from(contacts).where(
        and(eq(contacts.company_id, companyId), eq(contacts.number, numero)),
    );
    return c;
}

beforeAll(async () => {
    const [co] = await db.insert(companies)
        .values({ name: 'Empresa Nome Contato Teste', status: true })
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

describe('Nome do contato × pushName', () => {
    it('1) mensagem fromMe NÃO usa o pushName do dono como nome do contato novo', async () => {
        await whatsappService.handleMessagesWebhook(
            connectionId,
            waPayload({
                remoteJid: `${NUMERO}@s.whatsapp.net`,
                text: 'Olá, posso ajudar?',
                fromMe: true,
                pushName: DONO,
            }),
        );

        const c = await contatoPorNumero(NUMERO);
        expect(c).toBeTruthy();
        expect(c.name).not.toBe(DONO);
        expect(c.name).toBe(NUMERO); // fallback: o próprio número
    });

    it('2) quando o contato responde, o placeholder (número) dá lugar ao pushName real', async () => {
        // dono inicia a conversa → contato nasce com placeholder
        await whatsappService.handleMessagesWebhook(
            connectionId,
            waPayload({ remoteJid: `${NUMERO}@s.whatsapp.net`, text: 'oi', fromMe: true, pushName: DONO }),
        );
        // contato responde com o pushName dele
        await whatsappService.handleMessagesWebhook(
            connectionId,
            waPayload({ remoteJid: `${NUMERO}@s.whatsapp.net`, text: 'olá!', pushName: CLIENTE }),
        );

        const c = await contatoPorNumero(NUMERO);
        expect(c.name).toBe(CLIENTE);
    });

    it('3) nome real existente NÃO é sobrescrito por pushName posterior', async () => {
        await whatsappService.handleMessagesWebhook(
            connectionId,
            waPayload({ remoteJid: `${NUMERO}@s.whatsapp.net`, text: 'olá!', pushName: CLIENTE }),
        );
        // pushName mudou (apelido novo) — nome "de verdade" deve ser preservado
        await whatsappService.handleMessagesWebhook(
            connectionId,
            waPayload({ remoteJid: `${NUMERO}@s.whatsapp.net`, text: 'de novo', pushName: 'M. C. Apelido' }),
        );

        const c = await contatoPorNumero(NUMERO);
        expect(c.name).toBe(CLIENTE);
    });

    it('4) auto-reparo: contato gravado com o nome do dono é resetado ao chegar fromMe', async () => {
        // Estado corrompido pelo bug antigo: contato com o nome do dono
        await db.insert(contacts).values({ company_id: companyId, name: DONO, number: NUMERO });

        await whatsappService.handleMessagesWebhook(
            connectionId,
            waPayload({ remoteJid: `${NUMERO}@s.whatsapp.net`, text: 'follow-up', fromMe: true, pushName: DONO }),
        );

        const c = await contatoPorNumero(NUMERO);
        expect(c.name).toBe(NUMERO); // volta ao placeholder; pushName real assume quando ele responder
    });

    it('5) fromMe para contato LID-only novo usa fallback de LID, não o nome do dono', async () => {
        await whatsappService.handleMessagesWebhook(
            connectionId,
            waPayload({ remoteJid: `${LID}@lid`, text: 'oi', fromMe: true, pushName: DONO }),
        );

        const [c] = await db.select().from(contacts).where(
            and(eq(contacts.company_id, companyId), eq(contacts.lid, LID)),
        );
        expect(c).toBeTruthy();
        expect(c.name).not.toBe(DONO);
        expect(c.name).toBe(`LID ${LID}`);
    });
});
