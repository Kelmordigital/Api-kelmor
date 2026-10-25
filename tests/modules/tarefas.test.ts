import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { randomUUID } from 'crypto';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { contacts } from '../../src/modules/atendimento/atendimento.db.schema';
import { taskColumns, tasks } from '../../src/modules/tarefas/tarefas.db.schema';
import { buildApp } from '../../src/shared/server';

/** Central de Tarefas: quadro pessoal com colunas fixas e customizadas. */

const SUFFIX = Date.now();
const BASE = '/api/v1/tarefas';

interface Column { id: string; kind: string; title: string; position: number }
interface Task { id: string; column_id: string; titulo: string; position: number; completed_at: string | null; archived_at: string | null; contact: unknown }

describe('Tarefas', () => {
    const app = buildApp();
    let companyId: string;
    let adminId: string;
    let attendantId: string;
    let adminToken: string;
    let attendantToken: string;
    let otherAdminToken: string;
    let ownContactId: number;
    let foreignContactId: number;

    beforeAll(async () => {
        await app.ready();
        const [userProfile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'user'));
        const [adminProfile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'admin'));

        async function makeCompany(label: string) {
            const [co] = await db.insert(companies)
                .values({ name: `Empresa Tarefas ${label} ${SUFFIX}`, status: true })
                .returning({ id: companies.id });
            return co.id;
        }
        async function makeUser(label: string, profileId: number, coId: string) {
            const email = `tarefas-${label}-${SUFFIX}@test.com`;
            const [u] = await db.insert(users).values({
                name: label, email, password_hash: hashSync('senha123', 10),
                profile_id: profileId, company_id: coId, email_verified: true, is_approved: true,
            }).returning({ id: users.id });
            const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: 'senha123' } });
            return { id: u.id, token: JSON.parse(res.body).access_token as string };
        }

        companyId = await makeCompany('A');
        const otherCompanyId = await makeCompany('B');
        const admin = await makeUser('admin', adminProfile.id, companyId);
        const attendant = await makeUser('attendant', userProfile.id, companyId);
        adminId = admin.id; adminToken = admin.token;
        attendantId = attendant.id; attendantToken = attendant.token;
        otherAdminToken = (await makeUser('other-admin', adminProfile.id, otherCompanyId)).token;

        const [own] = await db.insert(contacts).values({ company_id: companyId, name: 'Cliente A', number: '5511999990000' }).returning({ id: contacts.id });
        const [foreign] = await db.insert(contacts).values({ company_id: otherCompanyId, name: 'Segredo B', number: '5521888880000' }).returning({ id: contacts.id });
        ownContactId = own.id;
        foreignContactId = foreign.id;
    });

    afterAll(async () => { await app.close(); });

    const as = (token: string) => ({ authorization: `Bearer ${token}` });
    const req = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: object, token = attendantToken) =>
        app.inject({ method, url: `${BASE}${url}`, headers: as(token), ...(payload ? { payload } : {}) });
    const board = async (token = attendantToken, query = '') => {
        const res = await req('GET', `/board${query}`, undefined, token);
        return { res, body: JSON.parse(res.body) as { columns: Column[]; tasks: Task[] } };
    };
    const create = async (payload: object, token = attendantToken) => {
        const res = await req('POST', '', payload, token);
        return { res, body: JSON.parse(res.body) };
    };
    const columnOf = async (kind: string, token = attendantToken) => (await board(token)).body.columns.find((c) => c.kind === kind)!;
    const errorOf = (res: { body: string }) => JSON.parse(res.body).error;

    describe('quadro', () => {
        it('primeiro acesso cria Pilha de Ação e Concluídas, nessa ordem', async () => {
            const { res, body } = await board();
            expect(res.statusCode).toBe(200);
            expect(body.columns.map((c) => [c.kind, c.title])).toEqual([['stack', 'Pilha de Ação'], ['done', 'Concluídas']]);
            expect(body.tasks).toEqual([]);
        });

        it('acessar de novo não duplica as colunas fixas', async () => {
            await board();
            const rows = await db.select().from(taskColumns)
                .where(and(eq(taskColumns.company_id, companyId), eq(taskColumns.user_id, attendantId)));
            expect(rows).toHaveLength(2);
        });

        it('colunas customizadas ficam entre as fixas, na ordem de criação', async () => {
            await req('POST', '/colunas', { title: '  Em andamento  ' });
            await req('POST', '/colunas', { title: 'Aguardando cliente' });
            const titles = (await board()).body.columns.map((c) => c.title);
            expect(titles).toEqual(['Pilha de Ação', 'Em andamento', 'Aguardando cliente', 'Concluídas']);
        });
    });

    describe('tarefas', () => {
        it('nova tarefa entra no topo da Pilha de Ação, com o contato', async () => {
            const first = (await create({ titulo: '  Ligar  ', contact_id: ownContactId, due_date: '2030-01-10T12:00:00.000Z' })).body;
            const second = (await create({ titulo: 'Enviar proposta' })).body;
            const stack = await columnOf('stack');
            expect(first).toMatchObject({ titulo: 'Ligar', column_id: stack.id, contact_id: ownContactId, due_date: '2030-01-10T12:00:00.000Z', completed_at: null });
            expect(second.position).toBeLessThan(first.position);

            const tasksInBoard = (await board()).body.tasks;
            expect(tasksInBoard.find((t) => t.id === first.id)!.contact).toEqual({
                id: ownContactId, name: 'Cliente A', number: '5511999990000', profile_pic_url: null,
            });
            expect(tasksInBoard.find((t) => t.id === second.id)!.contact).toBeNull();
        });

        it('pode nascer numa coluna customizada; coluna de outro dono cai na Pilha', async () => {
            const custom = (await board()).body.columns.find((c) => c.title === 'Em andamento')!;
            expect((await create({ titulo: 'Na custom', column_id: custom.id })).body.column_id).toBe(custom.id);
            const adminStack = await columnOf('stack', adminToken);
            const stack = await columnOf('stack');
            expect((await create({ titulo: 'Coluna alheia', column_id: adminStack.id })).body.column_id).toBe(stack.id);
        });

        it('editar altera só os campos enviados', async () => {
            const t = (await create({ titulo: 'Original', descricao: 'Desc' })).body;
            const res = await req('PUT', `/${t.id}`, { titulo: ' Renomeada ', due_date: null });
            expect(res.statusCode).toBe(200);
            expect(JSON.parse(res.body)).toMatchObject({ titulo: 'Renomeada', descricao: 'Desc', due_date: null });
        });

        it('mover para Concluídas conclui; voltar reabre; posição reindexada', async () => {
            const t = (await create({ titulo: 'Mover' })).body;
            const done = await columnOf('done');
            const moved = JSON.parse((await req('PATCH', `/${t.id}/move`, { column_id: done.id, index: 0 })).body);
            expect(moved).toMatchObject({ column_id: done.id, position: 0 });
            expect(moved.completed_at).not.toBeNull();

            const stack = await columnOf('stack');
            const back = JSON.parse((await req('PATCH', `/${t.id}/move`, { column_id: stack.id, index: 1 })).body);
            expect(back).toMatchObject({ column_id: stack.id, position: 1, completed_at: null });
        });

        it('concluir/reabrir por atalho', async () => {
            const t = (await create({ titulo: 'Atalho' })).body;
            const done = JSON.parse((await req('PATCH', `/${t.id}/concluir`, {})).body);
            expect(done.column_id).toBe((await columnOf('done')).id);
            expect(done.completed_at).not.toBeNull();
            const reopened = JSON.parse((await req('PATCH', `/${t.id}/concluir`, { done: false })).body);
            expect(reopened).toMatchObject({ column_id: (await columnOf('stack')).id, completed_at: null });
        });

        it('arquivar tira do quadro e põe nos arquivados; desarquivar volta', async () => {
            const t = (await create({ titulo: 'Arquivar' })).body;
            await req('PATCH', `/${t.id}/arquivar`, {});
            expect((await board()).body.tasks.some((x) => x.id === t.id)).toBe(false);
            const archived = JSON.parse((await req('GET', '/arquivadas')).body) as Task[];
            expect(archived.some((x) => x.id === t.id)).toBe(true);
            await req('PATCH', `/${t.id}/arquivar`, { archived: false });
            expect((await board()).body.tasks.some((x) => x.id === t.id)).toBe(true);
        });

        it('tarefas do contato (widget da conversa): não arquivadas, só minhas', async () => {
            await create({ titulo: 'Do contato', contact_id: ownContactId }, adminToken);
            const rows = JSON.parse((await req('GET', `/contato/${ownContactId}`)).body) as Task[];
            expect(rows.length).toBeGreaterThan(0);
            expect(rows.every((r) => r.contact && (r as unknown as { user_id: string }).user_id === attendantId)).toBe(true);
            expect((await req('GET', '/contato/abc')).statusCode).toBe(400);
        });

        it('excluir: 204, depois 404', async () => {
            const t = (await create({ titulo: 'Excluir' })).body;
            expect((await req('DELETE', `/${t.id}`)).statusCode).toBe(204);
            const again = await req('DELETE', `/${t.id}`);
            expect(again.statusCode).toBe(404);
            expect(errorOf(again)).toBe('Tarefa não encontrada');
        });

        it('cada um só mexe nas próprias tarefas (404 nas dos outros)', async () => {
            const mine = (await create({ titulo: 'Minha' })).body;
            for (const [method, url, payload] of [
                ['PUT', `/${mine.id}`, { titulo: 'x' }],
                ['PATCH', `/${mine.id}/arquivar`, {}],
                ['DELETE', `/${mine.id}`, undefined],
            ] as const) {
                expect((await req(method, url, payload, adminToken)).statusCode).toBe(404);
            }
            const [row] = await db.select().from(tasks).where(eq(tasks.id, mine.id));
            expect(row.titulo).toBe('Minha');
        });
    });

    describe('colunas', () => {
        it('renomear só customizada; fixas → 404', async () => {
            const custom = (await req('POST', '/colunas', { title: 'Renomear' }));
            const id = JSON.parse(custom.body).id;
            expect(JSON.parse((await req('PUT', `/colunas/${id}`, { title: ' Novo nome ' })).body).title).toBe('Novo nome');
            const stack = await columnOf('stack');
            expect((await req('PUT', `/colunas/${stack.id}`, { title: 'Hack' })).statusCode).toBe(404);
        });

        it('excluir customizada devolve as tarefas para a Pilha; fixas não excluem', async () => {
            const col = JSON.parse((await req('POST', '/colunas', { title: 'Temporária' })).body);
            const t = (await create({ titulo: 'Na temporária', column_id: col.id })).body;
            expect((await req('DELETE', `/colunas/${col.id}`)).statusCode).toBe(204);
            const [row] = await db.select().from(tasks).where(eq(tasks.id, t.id));
            expect(row.column_id).toBe((await columnOf('stack')).id);

            const done = await columnOf('done');
            const res = await req('DELETE', `/colunas/${done.id}`);
            expect(res.statusCode).toBe(404);
            expect(errorOf(res)).toBe('Coluna não encontrada ou não pode ser excluída');
        });
    });

    describe('quadro de outra pessoa (admin, só leitura)', () => {
        it('admin vê o quadro do atendente; atendente não vê o do admin', async () => {
            const { res, body } = await board(adminToken, `?owner_id=${attendantId}`);
            expect(res.statusCode).toBe(200);
            expect(body.tasks.length).toBeGreaterThan(0);
            const denied = await board(attendantToken, `?owner_id=${adminId}`);
            expect(denied.res.statusCode).toBe(403);
            expect(errorOf(denied.res)).toBe('Apenas administradores podem ver o quadro de outros usuários.');
        });

        it('dono que não é da empresa → 404, sem criar colunas para ele', async () => {
            const ghost = randomUUID();
            const res = (await board(adminToken, `?owner_id=${ghost}`)).res;
            expect(res.statusCode).toBe(404);
            expect(errorOf(res)).toBe('Usuário não encontrado');
            expect(await db.select().from(taskColumns).where(eq(taskColumns.user_id, ghost))).toHaveLength(0);
            expect((await board(otherAdminToken, `?owner_id=${attendantId}`)).res.statusCode).toBe(404);
            expect((await board(adminToken, '?owner_id=nao-e-uuid')).res.statusCode).toBe(400);
        });
    });

    describe('validação e isolamento', () => {
        it('contato de outra empresa é recusado (não vaza nome/telefone)', async () => {
            const res = (await create({ titulo: 'Vazamento', contact_id: foreignContactId })).res;
            expect(res.statusCode).toBe(400);
            expect(errorOf(res)).toBe('Contato não encontrado');
            const t = (await create({ titulo: 'Depois' })).body;
            const upd = await req('PUT', `/${t.id}`, { contact_id: foreignContactId });
            expect(upd.statusCode).toBe(400);
            expect(JSON.stringify((await board()).body)).not.toContain('Segredo B');
        });

        it.each([
            ['POST', '',            { titulo: '  ' },                           'titulo é obrigatório'],
            ['POST', '',            { titulo: 'x'.repeat(256) },                'titulo deve ter no máximo 255 caracteres'],
            ['POST', '',            { titulo: 'Data', due_date: 'amanhã' },      'due_date inválido'],
            ['POST', '/colunas',    { title: ' ' },                              'title é obrigatório'],
            ['POST', '/colunas',    { title: 'x'.repeat(101) },                  'title deve ter no máximo 100 caracteres'],
        ] as const)('%s %s %j → 400', async (method, url, payload, message) => {
            const res = await req(method, url, payload);
            expect(res.statusCode).toBe(400);
            expect(errorOf(res)).toBe(message);
        });

        it('edição: título vazio, concluir com texto e posição inválida → 400', async () => {
            const t = (await create({ titulo: 'Validar' })).body;
            expect(errorOf(await req('PUT', `/${t.id}`, { titulo: ' ' }))).toBe('titulo é obrigatório');
            expect(errorOf(await req('PATCH', `/${t.id}/concluir`, { done: 'false' }))).toBe('done inválido');
            const stack = await columnOf('stack');
            expect(errorOf(await req('PATCH', `/${t.id}/move`, { column_id: stack.id, index: -1 }))).toBe('index inválido');
            expect(errorOf(await req('PATCH', `/${t.id}/move`, {}))).toBe('column_id é obrigatório');
        });
    });
});
