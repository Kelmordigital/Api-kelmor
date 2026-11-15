import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { contacts, connections, queues, connectionQueues } from '../../src/modules/atendimento/atendimento.db.schema';
import { bots } from '../../src/modules/bots/bots.db.schema';
import { conversations } from '../../src/modules/atendimento/atendimento.module';

const SUFFIX = Date.now();
let companyId: string;
let companyWithBotId: string;

let connNoQueue: number;
let connOneQueue: number;
let connTwoQueues: number;
let connOneActiveOneDisabled: number;
let connWithBotCompany: number;

let activeQueueId: number;

async function makeContact(coId: string, name: string) {
    const [c] = await db.insert(contacts).values({ company_id: coId, name }).returning({ id: contacts.id });
    return c.id;
}

beforeAll(async () => {
    const [co] = await db.insert(companies)
        .values({ name: `Empresa AutoRoute ${SUFFIX}`, status: true })
        .returning({ id: companies.id });
    companyId = co.id;

    const [coBot] = await db.insert(companies)
        .values({ name: `Empresa AutoRoute Bot ${SUFFIX}`, status: true })
        .returning({ id: companies.id });
    companyWithBotId = coBot.id;
    await db.insert(bots).values({
        company_id: companyWithBotId, name: 'Bot Padrão', active: true, default_bot: true,
    });

    async function makeConn(coId: string, name: string) {
        const [c] = await db.insert(connections)
            .values({ company_id: coId, name, status: 'disconnected' })
            .returning({ id: connections.id });
        return c.id;
    }
    connNoQueue = await makeConn(companyId, 'Sem Fila');
    connOneQueue = await makeConn(companyId, 'Uma Fila');
    connTwoQueues = await makeConn(companyId, 'Duas Filas');
    connOneActiveOneDisabled = await makeConn(companyId, 'Uma Ativa Uma Desabilitada');
    connWithBotCompany = await makeConn(companyWithBotId, 'Conexão Empresa Com Bot');

    async function makeQueue(coId: string, name: string, enabled = true) {
        const [q] = await db.insert(queues)
            .values({ company_id: coId, name, enabled })
            .returning({ id: queues.id });
        return q.id;
    }
    const qA = await makeQueue(companyId, 'Fila A');
    const qB = await makeQueue(companyId, 'Fila B');
    const qDisabled = await makeQueue(companyId, 'Fila Desabilitada', false);
    const qBotCo = await makeQueue(companyWithBotId, 'Fila Empresa Bot');
    activeQueueId = qA;

    await db.insert(connectionQueues).values([
        { connection_id: connOneQueue, queue_id: qA },
        { connection_id: connTwoQueues, queue_id: qA },
        { connection_id: connTwoQueues, queue_id: qB },
        { connection_id: connOneActiveOneDisabled, queue_id: qA },
        { connection_id: connOneActiveOneDisabled, queue_id: qDisabled },
        { connection_id: connWithBotCompany, queue_id: qBotCo },
    ]);
});

describe('findOrCreateOpen — roteamento automático por fila da conexão', () => {
    it('conexão sem fila vinculada: ticket nasce Pendente sem fila', async () => {
        const contactId = await makeContact(companyId, 'Contato Sem Fila');
        const { ticket } = await conversations.findOrCreateOpen(companyId, contactId, connNoQueue);
        expect(ticket.status_id).toBe(1);
        expect(ticket.queue_id).toBeNull();
    });

    it('conexão com exatamente 1 fila ativa: ticket nasce roteado pra essa fila', async () => {
        const contactId = await makeContact(companyId, 'Contato Uma Fila');
        const { ticket } = await conversations.findOrCreateOpen(companyId, contactId, connOneQueue);
        expect(ticket.queue_id).toBe(activeQueueId);
        expect(ticket.status_id).toBe(1); // distribution 'none' por padrão: fica pendente NA fila
    });

    it('conexão com 2 filas ativas: sem roteamento automático (fica pendente sem fila)', async () => {
        const contactId = await makeContact(companyId, 'Contato Duas Filas');
        const { ticket } = await conversations.findOrCreateOpen(companyId, contactId, connTwoQueues);
        expect(ticket.status_id).toBe(1);
        expect(ticket.queue_id).toBeNull();
    });

    it('fila desabilitada não conta: só a ativa é considerada, rotea normalmente', async () => {
        const contactId = await makeContact(companyId, 'Contato Uma Ativa Uma Desabilitada');
        const { ticket } = await conversations.findOrCreateOpen(companyId, contactId, connOneActiveOneDisabled);
        expect(ticket.queue_id).toBe(activeQueueId);
    });

    it('empresa com bot ativo: ignora o vínculo da conexão, ticket nasce em Bot sem fila', async () => {
        const contactId = await makeContact(companyWithBotId, 'Contato Empresa Bot');
        const { ticket } = await conversations.findOrCreateOpen(companyWithBotId, contactId, connWithBotCompany);
        expect(ticket.status_id).toBe(9);
        expect(ticket.queue_id).toBeNull();
    });
});
