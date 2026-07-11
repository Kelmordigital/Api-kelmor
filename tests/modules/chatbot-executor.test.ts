import { describe, it, expect, beforeAll } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { contacts, tickets, atendimento_messages } from '../../src/modules/atendimento/atendimento.db.schema';
import { bots, bot_nodes, bot_conversations } from '../../src/modules/bots/bots.db.schema';
import { chatbotExecutorService } from '../../src/modules/bots/chatbot-executor.service';

const SUFFIX = Date.now();
let companyId: string;
let contactId: number;

beforeAll(async () => {
    const [co] = await db.insert(companies)
        .values({ name: `Empresa Executor Teste ${SUFFIX}`, status: true })
        .returning({ id: companies.id });
    companyId = co.id;

    const [bot] = await db.insert(bots).values({
        company_id: companyId,
        name: 'Bot Padrão',
        active: true,
        default_bot: true,
    }).returning();

    // Nó `start` real e com mensagem: garante que, SEM a guarda de status_id
    // sendo adicionada nesta task, o executor teria de fato criado uma
    // conversa/enviado mensagem — isolando a causa do teste corretamente
    // (sem esse nó, o executor já pararia antes por "sem nó start", mascarando
    // a checagem que estamos testando).
    await db.insert(bot_nodes).values({
        id: `start-${SUFFIX}`,
        bot_id: bot.id,
        company_id: companyId,
        type: 'start',
        label: 'Início',
        message: 'Olá! Bem-vindo(a).',
    });

    const [ct] = await db.insert(contacts)
        .values({ company_id: companyId, name: 'Contato Executor' })
        .returning({ id: contacts.id });
    contactId = ct.id;
});

describe('chatbotExecutorService.execute — reconfere status antes de rodar', () => {
    it('não cria conversa de bot quando o ticket já não está mais em status_id=9', async () => {
        const phone = `55119${SUFFIX}`;
        const [ticket] = await db.insert(tickets)
            .values({ company_id: companyId, contact_id: contactId, status_id: 2 }) // já foi aceito por um atendente
            .returning();

        await chatbotExecutorService.execute(companyId, 1, phone, 'oi', ticket.id, contactId, 'Cliente');

        const [conversation] = await db.select().from(bot_conversations)
            .where(and(eq(bot_conversations.company_id, companyId), eq(bot_conversations.contact_phone, phone)));
        expect(conversation).toBeUndefined();
    });

    it('cria conversa normalmente quando o ticket ainda está em status_id=9 (controle: prova que o nó start funciona)', async () => {
        const phone = `55118${SUFFIX}`;
        const [ticket] = await db.insert(tickets)
            .values({ company_id: companyId, contact_id: contactId, status_id: 9 })
            .returning();

        await chatbotExecutorService.execute(companyId, 1, phone, 'oi', ticket.id, contactId, 'Cliente');

        const [conversation] = await db.select().from(bot_conversations)
            .where(and(eq(bot_conversations.company_id, companyId), eq(bot_conversations.contact_phone, phone)));
        expect(conversation).toBeDefined();
    });
});

describe('chatbotExecutorService.execute — loga as mensagens do bot em at_messages', () => {
    it('salva a mensagem do nó inicial (start) com from_me=true e user_id=null', async () => {
        // Empresa/contato/bot próprios e isolados — a empresa do describe
        // anterior (Task 4) já tem um bot default_bot=true nela; reaproveitar
        // o mesmo companyId aqui criaria DOIS bots default_bot=true pra mesma
        // empresa, tornando findDefaultActive ambíguo (a query não tem
        // ORDER BY, então não há garantia de qual linha volta primeiro).
        const [co] = await db.insert(companies)
            .values({ name: `Empresa Log Bot Teste ${SUFFIX}`, status: true })
            .returning({ id: companies.id });
        const logCompanyId = co.id;

        const [ct] = await db.insert(contacts)
            .values({ company_id: logCompanyId, name: 'Contato Log Bot' })
            .returning({ id: contacts.id });
        const logContactId = ct.id;

        const [bot] = await db.insert(bots).values({
            company_id: logCompanyId,
            name: 'Bot Com Nó',
            active: true,
            default_bot: true,
        }).returning();

        // id distinto do nó `start-${SUFFIX}` criado no beforeAll (Task 4):
        // bot_nodes.id é chave primária GLOBAL (varchar(36), não escopada por
        // empresa) — reusar o mesmo literal aqui colidiria (unique violation),
        // já que SUFFIX é a mesma constante de módulo para o arquivo inteiro.
        await db.insert(bot_nodes).values({
            id: `start-log-${SUFFIX}`,
            bot_id: bot.id,
            company_id: logCompanyId,
            type: 'start',
            label: 'Início',
            message: 'Olá! Bem-vindo(a).',
        });

        const [ticket] = await db.insert(tickets)
            .values({ company_id: logCompanyId, contact_id: logContactId, status_id: 9 })
            .returning();

        const phone = `55129${SUFFIX}`;
        await chatbotExecutorService.execute(logCompanyId, 1, phone, 'oi', ticket.id, logContactId, 'Cliente');

        const [saved] = await db.select().from(atendimento_messages)
            .where(eq(atendimento_messages.ticket_id, ticket.id));

        expect(saved).toBeDefined();
        expect(saved.body).toBe('Olá! Bem-vindo(a).');
        expect(saved.from_me).toBe(true);
        expect(saved.user_id).toBeNull();
    });
});
