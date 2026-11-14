import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import ExcelJS from 'exceljs';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { contacts, historic_tickets, queues, tickets } from '../../src/modules/atendimento/atendimento.db.schema';
import { runSeed } from '../../src/database/seed';
import { buildApp } from '../../src/shared/server';

/** Relatórios: atendimentos por usuário, por cliente e tempo médio. */

const SUFFIX = Date.now();
const app = buildApp();
let companyId: string;
let otherCompanyId: string;
let adminToken: string;
let userToken: string;
let attendantA: string;
let attendantB: string;
let queueA: number;
let queueB: number;

const DAY = 24 * 60 * 60 * 1000;
const MIN = 60 * 1000;
/** Meio-dia (UTC) de N dias atrás. */
function noonDaysAgo(n: number) {
    const d = new Date(Date.now() - n * DAY);
    d.setUTCHours(12, 0, 0, 0);
    return d;
}
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const br = (d: Date) => ymd(d).split('-').reverse().join('/');

async function login(email: string, password = 'senha123') {
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });
    return JSON.parse(res.body).access_token as string;
}
function get(token: string, url: string) {
    return app.inject({ method: 'GET', url: `/api/v1${url}`, headers: { authorization: `Bearer ${token}` } });
}
const body = (res: { body: string }) => JSON.parse(res.body);
async function sheetRows(raw: Buffer) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(raw as unknown as ArrayBuffer);
    const rows: unknown[][] = [];
    wb.worksheets[0].eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
    return rows;
}

/** Ticket com histórico: cada passo é [minutos depois da criação, status_id_init, status_id_end]. */
async function ticketWithHistory(values: Partial<typeof tickets.$inferInsert> & { contact_id: number }, steps: [number, number, number][]) {
    const created = values.created_at as Date;
    const [t] = await db.insert(tickets).values({ company_id: companyId, status_id: 3, ...values }).returning({ id: tickets.id });
    if (steps.length) {
        await db.insert(historic_tickets).values(steps.map(([min, from, to]) => ({
            ticket_id: t.id, status_id_init: from, status_id_end: to, created_at: new Date(created.getTime() + min * MIN),
        })));
    }
    return t.id;
}

const ticketIds: number[] = [];

beforeAll(async () => {
    await app.ready();
    await runSeed();
    const tags = await db.select({ id: profiles.id, tag: profiles.tag }).from(profiles);
    const profileId = (tag: string) => tags.find((p) => p.tag === tag)!.id;

    const [co] = await db.insert(companies).values({ name: `Empresa Relatorios ${SUFFIX}`, status: true }).returning({ id: companies.id });
    companyId = co.id;
    const [other] = await db.insert(companies).values({ name: `Empresa Relatorios Outra ${SUFFIX}`, status: true }).returning({ id: companies.id });
    otherCompanyId = other.id;

    const person = (name: string, tag: string) => ({
        name, email: `rel-${name}-${SUFFIX}@test.com`, password_hash: hashSync('senha123', 10),
        profile_id: profileId(tag), company_id: companyId, email_verified: true, is_approved: true,
    });
    const [, a, b] = await db.insert(users).values([person('Admin', 'admin'), person('Bia', 'user'), person('Caio', 'user')]).returning({ id: users.id });
    attendantA = a.id;
    attendantB = b.id;

    const [qa, qb] = await db.insert(queues).values([{ company_id: companyId, name: 'Suporte' }, { company_id: companyId, name: 'Vendas' }]).returning({ id: queues.id });
    queueA = qa.id;
    queueB = qb.id;

    adminToken = await login(`rel-Admin-${SUFFIX}@test.com`);
    userToken = await login(`rel-Bia-${SUFFIX}@test.com`);
});

afterAll(async () => {
    if (ticketIds.length) await db.delete(historic_tickets).where(inArray(historic_tickets.ticket_id, ticketIds));
    await db.delete(tickets).where(inArray(tickets.company_id, [companyId, otherCompanyId]));
    await db.delete(contacts).where(inArray(contacts.company_id, [companyId, otherCompanyId]));
    await db.delete(queues).where(eq(queues.company_id, companyId));
    await db.delete(users).where(eq(users.company_id, companyId));
    await db.delete(companies).where(inArray(companies.id, [companyId, otherCompanyId]));
    await app.close();
});

describe('Acesso', () => {
    it('atendente não abre nenhum relatório', async () => {
        for (const url of ['/reports/tickets/user', '/reports/ticket/average', '/reporttickets/tickets/clienttickets']) {
            const res = await get(userToken, url);
            expect(res.statusCode, url).toBe(403);
        }
    });
});

describe('Relatório por usuário', () => {
    beforeAll(async () => {
        const [ct] = await db.insert(contacts).values({ company_id: companyId, name: 'Cliente Usuario', number: '5511900000001' }).returning({ id: contacts.id });
        const [oct] = await db.insert(contacts).values({ company_id: otherCompanyId, name: 'Cliente Outra', number: '5511900000002' }).returning({ id: contacts.id });
        const base = { company_id: companyId, contact_id: ct.id };
        const rows = await db.insert(tickets).values([
            { ...base, status_id: 3, closed_by_user_id: attendantA, updated_at: noonDaysAgo(3) },
            { ...base, status_id: 3, closed_by_user_id: attendantA, updated_at: noonDaysAgo(2) },
            { ...base, status_id: 3, closed_by_user_id: attendantA, updated_at: noonDaysAgo(20) },
            { ...base, status_id: 2, closed_by_user_id: attendantA, updated_at: noonDaysAgo(2) },        // aberto
            { ...base, status_id: 3, closed_by_user_id: attendantB, updated_at: noonDaysAgo(2), deleted_at: new Date() }, // excluído
            { ...base, status_id: 3, closed_by_user_id: attendantB, updated_at: noonDaysAgo(120) },     // além de 90 dias
            { company_id: otherCompanyId, contact_id: oct.id, status_id: 3, closed_by_user_id: attendantA, updated_at: noonDaysAgo(2) },
        ]).returning({ id: tickets.id });
        ticketIds.push(...rows.map((r) => r.id));
    });

    it('lista todos os usuários da empresa, por nome, com os tickets finalizados por cada um nos últimos 90 dias', async () => {
        const res = await get(adminToken, '/reports/tickets/user');
        expect(res.statusCode).toBe(200);
        expect(body(res)).toEqual([
            { id: expect.any(String), name: 'Admin', total_tickets: 0 },
            { id: attendantA, name: 'Bia', total_tickets: 3 },
            { id: attendantB, name: 'Caio', total_tickets: 0 },
        ]);
    });

    it('filtra pelo período da última atualização do ticket', async () => {
        const res = await get(adminToken, `/reports/tickets/user?dateStartParam=${ymd(noonDaysAgo(5))}&dateEndParam=${ymd(noonDaysAgo(2))}`);
        expect(body(res).find((u: { name: string }) => u.name === 'Bia').total_tickets).toBe(2);
        const older = await get(adminToken, `/reports/tickets/user?dateStartParam=${ymd(noonDaysAgo(200))}&dateEndParam=${ymd(noonDaysAgo(100))}`);
        expect(body(older).every((u: { total_tickets: number }) => u.total_tickets === 0)).toBe(true);
    });

    it('pdf=true baixa o PDF', async () => {
        const res = await get(adminToken, '/reports/tickets/user?pdf=true');
        expect(res.headers['content-type']).toBe('application/pdf');
        expect(res.headers['content-disposition']).toBe('attachment; filename="relatorio_usuarios.pdf"');
    });

    it('excel=true baixa a planilha', async () => {
        const res = await get(adminToken, '/reports/tickets/user?excel=true');
        expect(res.headers['content-type']).toContain('spreadsheetml');
        expect(res.headers['content-disposition']).toBe('attachment; filename="relatorio_usuarios.xlsx"');
        expect(await sheetRows(res.rawPayload)).toEqual([
            ['Nome do Atendente', 'Tickets Encerrados'], ['Admin', 0], ['Bia', 3], ['Caio', 0],
        ]);
    });
});

describe('Relatório por cliente', () => {
    beforeAll(async () => {
        const made = await db.insert(contacts).values([
            { company_id: companyId, name: 'Ana', number: '5511911110001' },
            { company_id: companyId, name: 'Bruno', number: '5511911110002' },
            { company_id: companyId, name: 'Carla', number: '5511911110003' },
            { company_id: companyId, name: 'Carla', number: '5511911110004' },
            { company_id: otherCompanyId, name: 'Ana', number: '5511911110005' },
        ]).returning({ id: contacts.id });
        const [ana, bruno, carla1, carla2, foreign] = made.map((c) => c.id);
        const now = new Date();
        const rows = await db.insert(tickets).values([
            { company_id: companyId, contact_id: ana, updated_at: now },
            { company_id: companyId, contact_id: ana, updated_at: now },
            { company_id: companyId, contact_id: ana, updated_at: now, status_id: 3 },
            { company_id: companyId, contact_id: bruno, updated_at: now },
            { company_id: companyId, contact_id: bruno, updated_at: noonDaysAgo(2) },             // fora de hoje
            { company_id: companyId, contact_id: bruno, updated_at: now, deleted_at: now },        // excluído
            { company_id: otherCompanyId, contact_id: foreign, updated_at: now },
            { company_id: companyId, contact_id: carla1, updated_at: new Date('2030-05-01T12:00:00Z') },
            { company_id: companyId, contact_id: carla2, updated_at: new Date('2030-05-01T12:00:00Z') },
        ]).returning({ id: tickets.id });
        ticketIds.push(...rows.map((r) => r.id));
    });

    it('sem período, conta os tickets de hoje por cliente, do maior para o menor', async () => {
        const res = await get(adminToken, '/reporttickets/tickets/clienttickets');
        expect(res.statusCode).toBe(200);
        expect(body(res)).toMatchObject({ items: [{ client: 'Ana', ticket_count: 3 }, { client: 'Bruno', ticket_count: 1 }], count: 2, pages: 1 });
    });

    it('pagina', async () => {
        const res = await get(adminToken, '/reporttickets/tickets/clienttickets?page=2&limit=1');
        expect(body(res)).toMatchObject({ items: [{ client: 'Bruno', ticket_count: 1 }], count: 2, pages: 2 });
    });

    it('excel=true baixa a planilha com todos os clientes', async () => {
        const res = await get(adminToken, '/reporttickets/tickets/clienttickets?excel=true&limit=1');
        expect(res.headers['content-disposition']).toBe('attachment; filename="relatorio_clientes.xlsx"');
        const rows = await sheetRows(res.rawPayload);
        expect(rows[0].slice(0, 1)).toEqual(['Cliente']);
        expect(rows.slice(1).map((r) => [r[0], r[r.length - 1]])).toEqual([['Ana', 3], ['Bruno', 1]]);
    });

    it('[correção] pdf=true baixa um PDF de verdade', async () => {
        const res = await get(adminToken, '/reporttickets/tickets/clienttickets?pdf=true');
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toBe('application/pdf');
        expect(res.headers['content-disposition']).toBe('attachment; filename="relatorio_clientes.pdf"');
        expect(res.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('[correção] clientes diferentes com o mesmo nome são contados separadamente', async () => {
        const res = await get(adminToken, '/reporttickets/tickets/clienttickets?dateStartParam=2030-05-01&dateEndParam=2030-05-01');
        expect(body(res)).toMatchObject({
            items: [{ client: 'Carla', ticket_count: 1 }, { client: 'Carla', ticket_count: 1 }],
            count: 2,
        });
    });
});

describe('Tempo médio', () => {
    const d1 = noonDaysAgo(4);
    const d2 = noonDaysAgo(3);

    beforeAll(async () => {
        const [ct] = await db.insert(contacts).values({ company_id: companyId, name: 'Cliente Tempo', number: '5511922220001' }).returning({ id: contacts.id });
        const t = (created: Date, extra: Partial<typeof tickets.$inferInsert>, steps: [number, number, number][]) =>
            ticketWithHistory({ contact_id: ct.id, created_at: created, ...extra }, steps);
        ticketIds.push(
            // d1, fila Suporte, Bia: atende em 10 e 20 min; finaliza em 60 e 120 min
            await t(d1, { queue_id: queueA, attendant_user_id: attendantA }, [[10, 1, 2], [60, 2, 3]]),
            await t(d1, { queue_id: queueA, attendant_user_id: attendantA }, [[20, 1, 2], [120, 2, 3]]),
            // d2, fila Vendas, Caio: atende em 5 min; encerra com pesquisa (status 7) em 30 min
            await t(d2, { queue_id: queueB, attendant_user_id: attendantB }, [[5, 1, 2], [30, 2, 7]]),
            // fora: excluído e além de 90 dias
            await t(d2, { deleted_at: new Date() }, [[1, 1, 2]]),
            await t(noonDaysAgo(100), {}, [[1, 1, 2]]),
        );
    });

    const d1Row = { day: br(d1), time_opened: 15 * MIN, label_opened: '00:15:00', time_closed: 90 * MIN, label_closed: '01:30:00' };
    const d2Row = { day: br(d2), time_opened: 5 * MIN, label_opened: '00:05:00', time_closed: 30 * MIN, label_closed: '00:30:00' };
    const range = `dateInit=${ymd(d1)}&dateEnd=${ymd(d2)}`;
    /** O código antigo devolvia os tempos como texto; a caracterização compara o valor. */
    const avg = async (url: string) => (body(await get(adminToken, url)) as Record<string, unknown>[])
        .map((r) => ({ ...r, time_opened: Number(r.time_opened), time_closed: Number(r.time_closed) }));

    it('média por dia de criação: até ser atendido e até ser finalizado', async () => {
        const res = await get(adminToken, `/reports/ticket/average?${range}`);
        expect(res.statusCode).toBe(200);
        expect(await avg(`/reports/ticket/average?${range}`)).toEqual([d1Row, d2Row]);
    });

    it('filtra por fila, atendente e período', async () => {
        expect(await avg(`/reports/ticket/average?${range}&queueId=${queueA}`)).toEqual([d1Row]);
        expect(await avg(`/reports/ticket/average?${range}&userId=${attendantB}`)).toEqual([d2Row]);
        expect(await avg(`/reports/ticket/average?dateInit=${ymd(d2)}&dateEnd=${ymd(d2)}`)).toEqual([d2Row]);
    });

    it('pagina por dia quando pedido', async () => {
        expect(await avg(`/reports/ticket/average?${range}&page=2&limit=1`)).toEqual([d2Row]);
    });

    it('graph=true traz os últimos 7 dias, ignorando o período', async () => {
        const res = await avg(`/reports/ticket/average?graph=true&dateInit=2000-01-01&dateEnd=2000-01-02`);
        expect(res).toEqual(expect.arrayContaining([d1Row, d2Row]));
    });

    it('excel=true baixa a planilha', async () => {
        const res = await get(adminToken, `/reports/ticket/average?${range}&excel=true`);
        expect(res.headers['content-disposition']).toBe('attachment; filename="relatorio_tempo_medio.xlsx"');
        expect(await sheetRows(res.rawPayload)).toEqual([
            ['Dia', 'Tempo para Atender', 'Tempo em Atendimento'], [br(d1), '00:15:00', '01:30:00'], [br(d2), '00:05:00', '00:30:00'],
        ]);
    });

    it('[correção] pdf=true baixa um PDF de verdade', async () => {
        const res = await get(adminToken, `/reports/ticket/average?${range}&pdf=true`);
        expect(res.headers['content-type']).toBe('application/pdf');
        expect(res.headers['content-disposition']).toBe('attachment; filename="relatorio_tempo_medio.pdf"');
        expect(res.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    });

    it('[correção] os tempos vêm como número (em milissegundos)', async () => {
        const [row] = body(await get(adminToken, `/reports/ticket/average?dateInit=${ymd(d1)}&dateEnd=${ymd(d1)}`));
        expect(row.time_opened).toBe(15 * MIN);
        expect(row.time_closed).toBe(90 * MIN);
    });

    it('[correção] sem paginação pedida, traz todos os dias do período (a tela pede 30)', async () => {
        const [ct] = await db.insert(contacts).values({ company_id: companyId, name: 'Cliente Muitos Dias', number: '5511922220002' }).returning({ id: contacts.id });
        const start = 60;
        for (let n = start; n > start - 25; n--) {
            ticketIds.push(await ticketWithHistory({ contact_id: ct.id, created_at: noonDaysAgo(n), queue_id: queueB }, [[1, 1, 2]]));
        }
        const res = body(await get(adminToken, `/reports/ticket/average?dateInit=${ymd(noonDaysAgo(start))}&dateEnd=${ymd(noonDaysAgo(start - 24))}&queueId=${queueB}`));
        expect(res).toHaveLength(25);
    });

    it('[correção] transferência e reabertura não contam como "atender"; só o primeiro encerramento conta', async () => {
        const [ct] = await db.insert(contacts).values({ company_id: companyId, name: 'Cliente Transferido', number: '5511922220003' }).returning({ id: contacts.id });
        const d = noonDaysAgo(10);
        ticketIds.push(
            // atende em 10 min, transfere em 50, finaliza em 60, reabre em 300 e finaliza em 400
            await ticketWithHistory({ contact_id: ct.id, created_at: d, queue_id: queueA }, [[10, 1, 2], [50, 2, 2], [60, 2, 3], [300, 3, 2], [400, 2, 3]]),
        );
        const res = await avg(`/reports/ticket/average?dateInit=${ymd(d)}&dateEnd=${ymd(d)}`);
        expect(res).toEqual([{ day: br(d), time_opened: 10 * MIN, label_opened: '00:10:00', time_closed: 60 * MIN, label_closed: '01:00:00' }]);
    });

    it('[correção] encerramento com pesquisa conta quando o atendente encerra, não quando o cliente responde', async () => {
        const [ct] = await db.insert(contacts).values({ company_id: companyId, name: 'Cliente Pesquisa', number: '5511922220004' }).returning({ id: contacts.id });
        const d = noonDaysAgo(11);
        ticketIds.push(await ticketWithHistory({ contact_id: ct.id, created_at: d }, [[5, 1, 2], [30, 2, 7], [300, 7, 3]]));
        const res = await avg(`/reports/ticket/average?dateInit=${ymd(d)}&dateEnd=${ymd(d)}`);
        expect(res).toEqual([{ day: br(d), time_opened: 5 * MIN, label_opened: '00:05:00', time_closed: 30 * MIN, label_closed: '00:30:00' }]);
    });
});

describe('[correção] Filtros malformados', () => {
    it('data fora do formato → 400', async () => {
        const users = await get(adminToken, '/reports/tickets/user?dateStartParam=ontem');
        expect(users.statusCode).toBe(400);
        expect(body(users).message).toBe('dateStartParam deve estar no formato AAAA-MM-DD');
        const avg = await get(adminToken, '/reports/ticket/average?dateInit=2026-13-45');
        expect(avg.statusCode).toBe(400);
        expect(body(avg).message).toBe('dateInit deve estar no formato AAAA-MM-DD');
    });

    it('fila, conexão ou atendente malformados → 400', async () => {
        expect(body(await get(adminToken, '/reports/ticket/average?queueId=abc')).message).toBe('queueId inválido');
        expect(body(await get(adminToken, '/reports/ticket/average?connectionId=abc')).message).toBe('connectionId inválido');
        expect(body(await get(adminToken, '/reports/ticket/average?userId=fulano')).message).toBe('userId inválido');
    });

    it('paginação malformada usa o padrão', async () => {
        expect((await get(adminToken, '/reporttickets/tickets/clienttickets?page=abc&limit=xyz')).statusCode).toBe(200);
        expect((await get(adminToken, '/reports/ticket/average?page=abc&limit=xyz')).statusCode).toBe(200);
    });
});
