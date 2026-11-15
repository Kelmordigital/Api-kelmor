import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { companyPermissions } from '../../src/modules/configuracao-geral/configuracao-geral.db.schema';
import { atendimento_messages, connections, contacts, historic_tickets, tickets } from '../../src/modules/atendimento/atendimento.db.schema';
import { TicketAutoCloser } from '../../src/modules/atendimento/ticket-auto-close';
import { whatsappService } from '../../src/modules/whatsapp/whatsapp.service';
import { automaticMessages } from '../../src/modules/atendimento/atendimento.module';

const SUFFIX = Date.now();
const ago = (hours: number) => sql`now() - make_interval(mins => ${Math.round(hours * 60)})`;

let companyId: string;      // fecha abertos e pendentes após 23h
let noPendingCo: string;    // fecha só abertos (pendentes desligado)
let contactId: number;
let otherContactId: number;

async function makeTicket(company: string, contact: number, statusId: number, createdHoursAgo: number, msgs: Array<[fromMe: boolean, hoursAgo: number]>) {
    const [t] = await db.insert(tickets)
        .values({ company_id: company, contact_id: contact, status_id: statusId, created_at: ago(createdHoursAgo) as unknown as Date })
        .returning({ id: tickets.id });
    for (const [fromMe, hoursAgo] of msgs) {
        await db.insert(atendimento_messages).values({
            ticket_id: t.id, contact_id: contact, company_id: company, body: fromMe ? 'atendente' : 'cliente',
            from_me: fromMe, created_at: ago(hoursAgo) as unknown as Date,
        });
    }
    return t.id;
}

async function statusOf(id: number) {
    const [row] = await db.select({ status_id: tickets.status_id }).from(tickets).where(eq(tickets.id, id));
    return row.status_id;
}

describe('Fechamento automático de tickets (23h sem nenhuma mensagem)', () => {
    const created: number[] = [];

    beforeAll(async () => {
        const [a] = await db.insert(companies).values({ name: `AutoClose ${SUFFIX}`, status: true }).returning({ id: companies.id });
        const [b] = await db.insert(companies).values({ name: `AutoClose B ${SUFFIX}`, status: true }).returning({ id: companies.id });
        companyId = a.id;
        noPendingCo = b.id;
        await db.insert(companyPermissions).values([
            { company_id: companyId, close_open_tickets: true, close_open_tickets_interval: 23, close_pending_tickets: true, close_pending_tickets_interval: 23 },
            { company_id: noPendingCo, close_open_tickets: true, close_open_tickets_interval: 23, close_pending_tickets: false, close_pending_tickets_interval: 23 },
        ]);
        const [c] = await db.insert(contacts).values({ company_id: companyId, name: 'Cliente', number: `55640000${SUFFIX % 10000}` }).returning({ id: contacts.id });
        const [c2] = await db.insert(contacts).values({ company_id: noPendingCo, name: 'Cliente B', number: `55641111${SUFFIX % 10000}` }).returning({ id: contacts.id });
        contactId = c.id;
        otherContactId = c2.id;
    });

    afterEach(() => vi.restoreAllMocks());

    afterAll(async () => {
        const ids = (await db.select({ id: tickets.id }).from(tickets).where(inArray(tickets.company_id, [companyId, noPendingCo]))).map((r) => r.id);
        if (ids.length) {
            await db.delete(atendimento_messages).where(inArray(atendimento_messages.ticket_id, ids));
            await db.delete(historic_tickets).where(inArray(historic_tickets.ticket_id, ids));
            await db.delete(tickets).where(inArray(tickets.id, ids));
        }
        await db.delete(connections).where(inArray(connections.company_id, [companyId, noPendingCo]));
        await db.delete(contacts).where(inArray(contacts.company_id, [companyId, noPendingCo]));
        await db.delete(companyPermissions).where(inArray(companyPermissions.company_id, [companyId, noPendingCo]));
        await db.delete(companies).where(inArray(companies.id, [companyId, noPendingCo]));
    });

    it('fecha quem está 23h+ sem nenhuma mensagem, não importa quem falou por último', async () => {
        const atendenteUlt  = await makeTicket(companyId, contactId, 2, 30, [[false, 29], [true, 25]]); // cliente sumiu
        const clienteUlt    = await makeTicket(companyId, contactId, 2, 30, [[true, 29], [false, 24]]);
        const pendente      = await makeTicket(companyId, contactId, 1, 30, [[false, 26]]);             // ninguém respondeu
        const semMensagem   = await makeTicket(companyId, contactId, 1, 30, []);                        // conta da abertura
        const botParado     = await makeTicket(companyId, contactId, 9, 25, [[false, 24.5], [true, 24]]);
        const conversaViva  = await makeTicket(companyId, contactId, 2, 30, [[false, 29], [true, 5]]);  // falaram há 5h
        const clienteAgora  = await makeTicket(companyId, contactId, 2, 30, [[true, 29], [false, 0.5]]);
        const novo          = await makeTicket(companyId, contactId, 2, 5, []);
        const pesquisa      = await makeTicket(companyId, contactId, 7, 30, [[false, 29]]);
        created.push(atendenteUlt, clienteUlt, pendente, semMensagem, botParado, conversaViva, clienteAgora, novo, pesquisa);

        const messenger = vi.fn(async () => {});
        await new TicketAutoCloser(messenger).run();

        expect(await statusOf(atendenteUlt)).toBe(3);
        expect(await statusOf(clienteUlt)).toBe(3);
        expect(await statusOf(pendente)).toBe(3);
        expect(await statusOf(semMensagem)).toBe(3);
        expect(await statusOf(botParado)).toBe(3);
        expect(await statusOf(conversaViva)).toBe(2);   // mensagem há 5h → fica
        expect(await statusOf(clienteAgora)).toBe(2);   // cliente escreveu há 30 min → fica
        expect(await statusOf(novo)).toBe(2);           // aberto há 5h → fica
        expect(await statusOf(pesquisa)).toBe(7);       // aguardando pesquisa → fica

        const [hist] = await db.select().from(historic_tickets).where(eq(historic_tickets.ticket_id, atendenteUlt));
        expect(hist).toMatchObject({ user_id: null, status_id_init: 2, status_id_end: 3 });
    });

    it('fechado automaticamente vira "venda não realizada"; venda já marcada continua venda', async () => {
        const semMarca = await makeTicket(companyId, contactId, 2, 30, [[true, 25]]);
        const vendido  = await makeTicket(companyId, contactId, 2, 30, [[true, 25]]);
        await db.update(tickets).set({ is_sale: 1 }).where(eq(tickets.id, vendido));

        await new TicketAutoCloser(vi.fn(async () => {})).run();

        const saleOf = async (id: number) =>
            (await db.select({ is_sale: tickets.is_sale, status_id: tickets.status_id }).from(tickets).where(eq(tickets.id, id)))[0];
        expect(await saleOf(semMarca)).toEqual({ is_sale: 0, status_id: 3 });
        expect(await saleOf(vendido)).toEqual({ is_sale: 1, status_id: 3 });
    });

    it('despedida: só para quem venceu agora; os parados há tempo fecham em silêncio', async () => {
        const vencidoAgora = await makeTicket(companyId, contactId, 2, 24, [[true, 23.5]]);           // venceu há 30 min
        const antigo       = await makeTicket(companyId, contactId, 1, 24 * 20, [[false, 24 * 20]]); // parado desde 20 dias
        const messenger = vi.fn(async () => {});
        await new TicketAutoCloser(messenger).run();

        const calls = new Map(messenger.mock.calls.map((c) => [(c[0] as { id: number }).id, c[2]]));
        expect(calls.has(vencidoAgora)).toBe(true);
        expect(calls.get(vencidoAgora)).toBeUndefined();  // undefined = respeita "enviar despedida" da empresa
        expect(calls.get(antigo)).toBe(false);            // false = sem despedida
        expect(await statusOf(antigo)).toBe(3);
    });

    it('respeita a configuração: pendentes desligado → pendente velho fica; aberto velho fecha', async () => {
        const pendente = await makeTicket(noPendingCo, otherContactId, 1, 30, [[false, 29]]);
        const aberto   = await makeTicket(noPendingCo, otherContactId, 2, 30, [[false, 29]]);
        await new TicketAutoCloser(vi.fn(async () => {})).run();

        expect(await statusOf(pendente)).toBe(1);
        expect(await statusOf(aberto)).toBe(3);
    });

    it('duas réplicas fechando o mesmo ticket: só uma fecha e só uma despedida', async () => {
        const id = await makeTicket(companyId, contactId, 2, 24, [[false, 23]]);
        const messenger = vi.fn(async () => {});
        const closer = new TicketAutoCloser(messenger);
        const due = { id, company_id: companyId, status_id: 2, attendant_user_id: null, send_goodbye: true };

        const [a, b] = await Promise.all([closer.close(due), closer.close(due)]);
        expect([a, b].filter(Boolean)).toHaveLength(1);
        expect(messenger).toHaveBeenCalledTimes(1);
        const hist = await db.select().from(historic_tickets).where(eq(historic_tickets.ticket_id, id));
        expect(hist).toHaveLength(1);
    });
});

describe('Resposta por outro número quando o do ticket caiu (resolveSendConnection)', () => {
    let co: string;
    let down: number;
    let up: number;
    let oficial: number;
    let ticketId: number;

    beforeAll(async () => {
        const [c] = await db.insert(companies).values({ name: `Fallback ${SUFFIX}`, status: true }).returning({ id: companies.id });
        co = c.id;
        const [ct] = await db.insert(contacts).values({ company_id: co, name: 'X', number: '5564999998888' }).returning({ id: contacts.id });
        [{ id: down }] = await db.insert(connections).values({ company_id: co, name: 'Caiu', status: 'disconnected' }).returning({ id: connections.id });
        [{ id: oficial }] = await db.insert(connections).values({ company_id: co, name: 'Oficial', status: 'connected', type: 'whatsapp-oficial' }).returning({ id: connections.id });
        [{ id: up }] = await db.insert(connections).values({ company_id: co, name: 'No ar', status: 'connected' }).returning({ id: connections.id });
        [{ id: ticketId }] = await db.insert(tickets).values({ company_id: co, contact_id: ct.id, connection_id: down, status_id: 2 }).returning({ id: tickets.id });
    });

    afterEach(() => vi.restoreAllMocks());

    afterAll(async () => {
        await db.delete(tickets).where(eq(tickets.company_id, co));
        await db.delete(connections).where(eq(connections.company_id, co));
        await db.delete(contacts).where(eq(contacts.company_id, co));
        await db.delete(companies).where(eq(companies.id, co));
    });

    const mockStatus = (connected: number[]) =>
        vi.spyOn(whatsappService, 'getStatus').mockImplementation(async (id?: number) => ({
            status: connected.includes(id as number) ? 'connected' : 'disconnected',
        }));

    it('número do ticket no ar → usa ele, sem mexer no ticket', async () => {
        mockStatus([down, up]);
        expect(await automaticMessages.resolveSendConnection({ id: ticketId, company_id: co, connection_id: down })).toBe(down);
    });

    it('número do ticket caiu → responde pelo outro conectado (WhatsApp comum antes da oficial) e move o ticket', async () => {
        mockStatus([up, oficial]);
        expect(await automaticMessages.resolveSendConnection({ id: ticketId, company_id: co, connection_id: down })).toBe(up);
        const [row] = await db.select({ connection_id: tickets.connection_id }).from(tickets).where(eq(tickets.id, ticketId));
        expect(row.connection_id).toBe(up);
        await db.update(tickets).set({ connection_id: down }).where(eq(tickets.id, ticketId));
    });

    it('só a oficial no ar → usa a oficial', async () => {
        mockStatus([oficial]);
        expect(await automaticMessages.resolveSendConnection({ id: ticketId, company_id: co, connection_id: down })).toBe(oficial);
        await db.update(tickets).set({ connection_id: down }).where(eq(tickets.id, ticketId));
    });

    it('nenhum número no ar → mantém o do ticket (falha como antes)', async () => {
        mockStatus([]);
        expect(await automaticMessages.resolveSendConnection({ id: ticketId, company_id: co, connection_id: down })).toBe(down);
    });

    it('conexão do ticket removida (id que não existe mais) → usa outra conectada', async () => {
        mockStatus([up]);
        expect(await automaticMessages.resolveSendConnection({ id: ticketId, company_id: co, connection_id: 987654321 })).toBe(up);
        await db.update(tickets).set({ connection_id: down }).where(eq(tickets.id, ticketId));
    });
});
