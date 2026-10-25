import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { contacts, queues, tickets } from '../../src/modules/atendimento/atendimento.db.schema';
import { researchs, researchAnswers, researchHistorics, queueResearchs } from '../../src/modules/pesquisas/pesquisa.db.schema';
import { researchSurvey as surveyFlow } from '../../src/modules/pesquisas/pesquisa.module';
import { buildApp } from '../../src/shared/server';

/**
 * Pesquisas de satisfação: cadastro (admin), relatório e o fluxo de resposta
 * (pesquisa pendente → cliente responde → ticket fecha). O envio da pergunta
 * pelo WhatsApp é coberto em tests/unit/pesquisas.test.ts.
 */

const SUFFIX = Date.now();
const BASE = '/api/v1/configuracao/pesquisas';
const today = () => new Date().toISOString().slice(0, 10);

interface Research { id: number; name: string; active: boolean; default_research: boolean; answers: { id: number; title: string }[]; queues: { queue_id: number }[] }

describe('Pesquisas', () => {
    const app = buildApp();
    let companyId: string;
    let otherCompanyId: string;
    let adminToken: string;
    let otherAdminToken: string;
    let attendantId: string;
    let queueId: number;
    let otherQueueId: number;
    let foreignQueueId: number;
    let contactId: number;

    beforeAll(async () => {
        await app.ready();
        const [userProfile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'user'));
        const [adminProfile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'admin'));

        async function makeCompany(label: string) {
            const [co] = await db.insert(companies)
                .values({ name: `Empresa Pesquisas ${label} ${SUFFIX}`, status: true })
                .returning({ id: companies.id });
            return co.id;
        }
        async function makeUser(label: string, profileId: number, coId: string) {
            const email = `pesquisas-${label}-${SUFFIX}@test.com`;
            const [u] = await db.insert(users).values({
                name: `Pessoa ${label}`, email, password_hash: hashSync('senha123', 10),
                profile_id: profileId, company_id: coId, email_verified: true, is_approved: true,
            }).returning({ id: users.id });
            const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: 'senha123' } });
            return { id: u.id, token: JSON.parse(res.body).access_token as string };
        }

        companyId = await makeCompany('A');
        otherCompanyId = await makeCompany('B');
        adminToken = (await makeUser('admin', adminProfile.id, companyId)).token;
        attendantId = (await makeUser('attendant', userProfile.id, companyId)).id;
        otherAdminToken = (await makeUser('other', adminProfile.id, otherCompanyId)).token;

        const qs = await db.insert(queues).values([
            { company_id: companyId, name: 'Vendas' }, { company_id: companyId, name: 'Suporte' },
        ]).returning({ id: queues.id });
        [queueId, otherQueueId] = qs.map((q) => q.id);
        const [fq] = await db.insert(queues).values({ company_id: otherCompanyId, name: 'Fila B' }).returning({ id: queues.id });
        foreignQueueId = fq.id;
        const [c] = await db.insert(contacts).values({ company_id: companyId, name: 'Cliente', number: '5511900000001' }).returning({ id: contacts.id });
        contactId = c.id;
    });

    afterAll(async () => { await app.close(); });

    const as = (token: string) => ({ authorization: `Bearer ${token}` });
    const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object, token = adminToken) =>
        app.inject({ method, url: `${BASE}${url}`, headers: as(token), ...(payload ? { payload } : {}) });
    const list = async (token = adminToken) => JSON.parse((await call('GET', '', undefined, token)).body) as Research[];
    const byId = async (id: number) => (await list()).find((r) => r.id === id)!;
    const create = async (payload: object, token = adminToken) => JSON.parse((await call('POST', '', payload, token)).body);
    const messageOf = (res: { body: string }) => JSON.parse(res.body).message;

    async function closingTicket() {
        const [t] = await db.insert(tickets).values({
            company_id: companyId, contact_id: contactId, status_id: 7,
            queue_id: queueId, attendant_user_id: attendantId, closed_by_user_id: attendantId,
        }).returning();
        return t;
    }
    async function pendingSurvey(researchId: number, ticketId: number) {
        await db.insert(researchHistorics).values({ company_id: companyId, ticket_id: ticketId, research_id: researchId, contact_id: contactId, status: 'pending' });
    }

    describe('cadastro', () => {
        it('cria com padrões (satisfação, ativa, não padrão), opções e filas', async () => {
            const res = await call('POST', '', { name: '  NPS  ', answers: ['Ótimo', 'Bom', 'Ruim'], queue_ids: [queueId] });
            expect(res.statusCode).toBe(201);
            const created = JSON.parse(res.body);
            expect(created).toMatchObject({ company_id: companyId, name: 'NPS', type: 'satisfaction', active: true, default_research: false });

            const full = await byId(created.id);
            expect(full.answers.map((a) => a.title)).toEqual(['Ótimo', 'Bom', 'Ruim']);
            expect(full.queues.map((q) => q.queue_id)).toEqual([queueId]);
        });

        it.each([
            [{ answers: ['A'] },                'O nome da pesquisa é obrigatório'],
            [{ name: '  ', answers: ['A'] },    'O nome da pesquisa é obrigatório'],
            [{ name: 'Sem opções' },            'Adicione ao menos uma opção de resposta'],
            [{ name: 'Vazia', answers: [] },    'Adicione ao menos uma opção de resposta'],
        ])('400 para %j', async (payload, message) => {
            const res = await call('POST', '', payload);
            expect(res.statusCode).toBe(400);
            expect(messageOf(res)).toBe(message);
        });

        it('só uma pesquisa padrão por empresa', async () => {
            const a = await create({ name: 'Padrão 1', answers: ['x'], default_research: true });
            const b = await create({ name: 'Padrão 2', answers: ['x'], default_research: true });
            expect((await byId(a.id)).default_research).toBe(false);
            expect((await byId(b.id)).default_research).toBe(true);
            await call('PUT', `/${a.id}`, { default_research: true });
            expect((await byId(a.id)).default_research).toBe(true);
            expect((await byId(b.id)).default_research).toBe(false);
        });

        it('edição altera só o enviado e responde { ok: true }', async () => {
            const r = await create({ name: 'Editar', answers: ['Sim', 'Não'], queue_ids: [queueId] });
            const res = await call('PUT', `/${r.id}`, { name: 'Editada', active: false, queue_ids: [otherQueueId] });
            expect(res.statusCode).toBe(200);
            expect(JSON.parse(res.body)).toEqual({ ok: true });
            const after = await byId(r.id);
            expect(after).toMatchObject({ name: 'Editada', active: false });
            expect(after.answers.map((a) => a.title)).toEqual(['Sim', 'Não']);
            expect(after.queues.map((q) => q.queue_id)).toEqual([otherQueueId]);
        });

        it('ativas: só as ativas da empresa', async () => {
            const inactive = await create({ name: 'Inativa', answers: ['x'], active: false });
            const active = JSON.parse((await call('GET', '/active')).body) as { id: number; active: boolean }[];
            expect(active.every((r) => r.active)).toBe(true);
            expect(active.some((r) => r.id === inactive.id)).toBe(false);
        });

        it('excluir: 200 { ok: true }, depois 404; outra empresa não vê', async () => {
            const r = await create({ name: 'Excluir', answers: ['x'] });
            expect((await list(otherAdminToken)).some((x) => x.id === r.id)).toBe(false);
            const del = await call('DELETE', `/${r.id}`);
            expect(JSON.parse(del.body)).toEqual({ ok: true });
            const again = await call('DELETE', `/${r.id}`);
            expect(again.statusCode).toBe(404);
            expect(messageOf(again)).toBe('Pesquisa não encontrada');
        });
    });

    describe('fluxo de resposta', () => {
        it('pesquisa ativa da fila do ticket; nenhuma para fila sem pesquisa', async () => {
            const r = await create({ name: 'Da fila', answers: ['Sim'], queue_ids: [queueId] });
            const found = await surveyFlow.findActiveForQueue(queueId, companyId);
            expect(found).not.toBeNull();
            const fresh = (await db.insert(queues).values({ company_id: companyId, name: 'Sem pesquisa' }).returning({ id: queues.id }))[0];
            expect(await surveyFlow.findActiveForQueue(fresh.id, companyId)).toBeNull();
            expect(await surveyFlow.findActiveForQueue(null, companyId)).toBeNull();
            await call('DELETE', `/${r.id}`);
        });

        it('resposta pelo número (ou pelo texto) grava e fecha o ticket', async () => {
            const r = await create({ name: 'Satisfação', answers: ['Ótimo', 'Ruim'] });
            const ticket = await closingTicket();
            await pendingSurvey(r.id, ticket.id);

            expect(await surveyFlow.tryRecordAnswer(companyId, contactId, ' 2 ')).toBe(true);
            const [hist] = await db.select().from(researchHistorics).where(eq(researchHistorics.ticket_id, ticket.id));
            const [ruim] = await db.select().from(researchAnswers).where(and(eq(researchAnswers.research_id, r.id), eq(researchAnswers.title, 'Ruim')));
            expect(hist).toMatchObject({ status: 'answered', answer_id: ruim.id });
            const [closed] = await db.select().from(tickets).where(eq(tickets.id, ticket.id));
            expect(closed.status_id).toBe(3);

            const t2 = await closingTicket();
            await pendingSurvey(r.id, t2.id);
            expect(await surveyFlow.tryRecordAnswer(companyId, contactId, 'ótimo')).toBe(true);
        });

        it('mensagem que não é resposta válida não é capturada', async () => {
            const r = await create({ name: 'Inválida', answers: ['Sim', 'Não'] });
            const ticket = await closingTicket();
            await pendingSurvey(r.id, ticket.id);
            for (const text of ['3', 'talvez', '0']) {
                expect(await surveyFlow.tryRecordAnswer(companyId, contactId, text)).toBe(false);
            }
            const [hist] = await db.select().from(researchHistorics).where(eq(researchHistorics.ticket_id, ticket.id));
            expect(hist.status).toBe('pending');
            await db.update(researchHistorics).set({ status: 'expired' }).where(eq(researchHistorics.ticket_id, ticket.id));
        });

        it('sem pesquisa pendente, nada é capturado', async () => {
            expect(await surveyFlow.tryRecordAnswer(companyId, 999999999, '1')).toBe(false);
        });
    });

    describe('relatório', () => {
        it('agrega respostas por pesquisa com percentuais; filtra por atendente; detalha uma resposta', async () => {
            const r = await create({ name: `Relatório ${SUFFIX}`, answers: ['Bom', 'Ruim'] });
            for (const reply of ['1', '1', '2']) {
                const t = await closingTicket();
                await pendingSurvey(r.id, t.id);
                await surveyFlow.tryRecordAnswer(companyId, contactId, reply);
            }
            const res = await call('GET', `/report?dateInit=${today()}&dateEnd=${today()}`);
            const body = JSON.parse(res.body);
            const item = body.items.find((i: { research_id: number }) => i.research_id === r.id);
            expect(item).toMatchObject({ research: `Relatório ${SUFFIX}`, active: true, total: 3 });
            expect(item.answers.map((a: { answer: string; total: number; percentage: string }) => [a.answer, a.total, a.percentage]).sort())
                .toEqual([['Bom', 2, '67%'], ['Ruim', 1, '33%']]);
            expect(body.company_users.map((u: { id: string }) => u.id)).toContain(attendantId);

            const byOther = JSON.parse((await call('GET', `/report?userId=${crypto.randomUUID()}`)).body);
            expect(byOther.items.some((i: { research_id: number }) => i.research_id === r.id)).toBe(false);

            const bom = item.answers.find((a: { answer: string }) => a.answer === 'Bom');
            const view = JSON.parse((await call('GET', `/report/view?answerId=${bom.answerId}`)).body);
            expect(view.total).toBe(2);
            expect(view.tickets[0]).toMatchObject({ contact_name: 'Cliente', attendant_name: 'Pessoa attendant' });

            const missing = await call('GET', '/report/view');
            expect(missing.statusCode).toBe(400);
            expect(messageOf(missing)).toBe('answerId obrigatório');
        });
    });

    describe('isolamento e integridade', () => {
        it('editar pesquisa de outra empresa → 404 e não mexe nas opções dela', async () => {
            const foreign = await create({ name: 'Da B', answers: ['B1', 'B2'] }, otherAdminToken);
            const res = await call('PUT', `/${foreign.id}`, { answers: ['Hack'], queue_ids: [] });
            expect(res.statusCode).toBe(404);
            expect(messageOf(res)).toBe('Pesquisa não encontrada');
            const answers = await db.select().from(researchAnswers).where(eq(researchAnswers.research_id, foreign.id));
            expect(answers.map((a) => a.title).sort()).toEqual(['B1', 'B2']);
        });

        it('fila de outra empresa é ignorada no vínculo', async () => {
            const r = await create({ name: 'Fila alheia', answers: ['x'], queue_ids: [queueId, foreignQueueId] });
            const links = await db.select().from(queueResearchs).where(eq(queueResearchs.research_id, r.id));
            expect(links.map((l) => l.queue_id)).toEqual([queueId]);
            await call('DELETE', `/${r.id}`);
        });

        it('fila com pesquisa inativa e ativa vinculadas: vale a ativa', async () => {
            const q = (await db.insert(queues).values({ company_id: companyId, name: 'Duas pesquisas' }).returning({ id: queues.id }))[0];
            const inactive = await create({ name: 'Inativa na fila', answers: ['x'], active: false, queue_ids: [q.id] });
            const active = await create({ name: 'Ativa na fila', answers: ['x'], queue_ids: [q.id] });
            const found = await surveyFlow.findActiveForQueue(q.id, companyId);
            expect(found?.id).toBe(active.id);
            await call('DELETE', `/${inactive.id}`);
        });

        it('editar as opções preserva o histórico das que continuam', async () => {
            const r = await create({ name: 'Histórico', answers: ['Manter', 'Trocar'] });
            const t = await closingTicket();
            await pendingSurvey(r.id, t.id);
            await surveyFlow.tryRecordAnswer(companyId, contactId, '1');

            await call('PUT', `/${r.id}`, { answers: ['Manter', 'Nova'] });
            const [hist] = await db.select().from(researchHistorics).where(eq(researchHistorics.ticket_id, t.id));
            const [kept] = await db.select().from(researchAnswers).where(and(eq(researchAnswers.research_id, r.id), eq(researchAnswers.title, 'Manter')));
            expect(hist.answer_id).toBe(kept.id);
            expect((await byId(r.id)).answers.map((a) => a.title)).toEqual(['Manter', 'Nova']);
        });

        it.each([
            ['POST', '',            { name: 'Opção longa', answers: ['x'.repeat(201)] },       'Cada opção deve ter no máximo 200 caracteres'],
            ['POST', '',            { name: 'Opção vazia', answers: ['ok', '  '] },            'As opções de resposta não podem ficar em branco'],
            ['POST', '',            { name: 'Fila', answers: ['x'], queue_ids: ['vendas'] },   'queue_ids inválido'],
            ['PUT',  '/abc',        { name: 'x' },                                             'id inválido'],
            ['GET',  '/report/view?answerId=abc', undefined,                                   'answerId inválido'],
            ['GET',  '/report?dateInit=ontem', undefined,                                      'dateInit inválido'],
        ] as const)('%s %s → 400', async (method, url, payload, message) => {
            const res = await call(method, url, payload);
            expect(res.statusCode).toBe(400);
            expect(messageOf(res)).toBe(message);
        });
    });
});
