import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { quickMessages } from '../../src/modules/quick-messages/quick-messages.db.schema';
import { buildApp } from '../../src/shared/server';

/** Mensagens rápidas: CRUD multipart com mídia em disco, paginação e busca por título. */

const SUFFIX = Date.now();
const BASE = '/api/v1/configuracao/quick-messages';
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');

type Part = { name: string; value: string } | { name: string; filename: string; mime: string; data: Buffer };

/** Corpo multipart/form-data montado à mão para o app.inject. */
function multipart(parts: Part[]) {
    const boundary = `----kelmor${SUFFIX}`;
    const chunks: Buffer[] = [];
    for (const p of parts) {
        const header = 'filename' in p
            ? `--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"; filename="${p.filename}"\r\nContent-Type: ${p.mime}\r\n\r\n`
            : `--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"\r\n\r\n`;
        chunks.push(Buffer.from(header), 'filename' in p ? p.data : Buffer.from(p.value), Buffer.from('\r\n'));
    }
    chunks.push(Buffer.from(`--${boundary}--\r\n`));
    return { payload: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

const png = (filename = 'foto.png'): Part => ({ name: 'file', filename, mime: 'image/png', data: PNG });
const field = (name: string, value: string): Part => ({ name, value });
const onDisk = (mediaPath: string) => fs.existsSync(path.join(process.cwd(), mediaPath));

describe('Mensagens rápidas', () => {
    const app = buildApp();
    let companyId: string;
    let otherCompanyId: string;
    let adminToken: string;
    let attendantToken: string;
    let otherToken: string;

    const companyDir = () => path.join(process.cwd(), 'uploads', 'quick-messages', companyId);
    const filesInCompanyDir = () => (fs.existsSync(companyDir()) ? fs.readdirSync(companyDir()) : []);

    beforeAll(async () => {
        await app.ready();
        const [userProfile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'user'));
        const [adminProfile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'admin'));

        async function makeCompany(label: string) {
            const [co] = await db.insert(companies)
                .values({ name: `Empresa QuickMsg ${label} ${SUFFIX}`, status: true })
                .returning({ id: companies.id });
            return co.id;
        }
        async function makeUserAndLogin(label: string, profileId: number, coId: string) {
            const email = `quickmsg-${label}-${SUFFIX}@test.com`;
            await db.insert(users).values({
                name: label, email, password_hash: hashSync('senha123', 10),
                profile_id: profileId, company_id: coId,
                email_verified: true, is_approved: true,
            });
            const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: 'senha123' } });
            return JSON.parse(res.body).access_token as string;
        }

        companyId = await makeCompany('A');
        otherCompanyId = await makeCompany('B');
        adminToken = await makeUserAndLogin('admin', adminProfile.id, companyId);
        attendantToken = await makeUserAndLogin('attendant', userProfile.id, companyId);
        otherToken = await makeUserAndLogin('other', adminProfile.id, otherCompanyId);
    });

    afterAll(async () => {
        await app.close();
        for (const id of [companyId, otherCompanyId]) {
            fs.rmSync(path.join(process.cwd(), 'uploads', 'quick-messages', id), { recursive: true, force: true });
        }
    });

    const as = (token: string) => ({ authorization: `Bearer ${token}` });
    const send = (method: 'POST' | 'PUT', url: string, parts: Part[], token = adminToken) => {
        const { payload, contentType } = multipart(parts);
        return app.inject({ method, url, payload, headers: { ...as(token), 'content-type': contentType } });
    };
    const create = (parts: Part[], token = adminToken) => send('POST', BASE, parts, token);
    const update = (id: number, parts: Part[], token = adminToken) => send('PUT', `${BASE}/${id}`, parts, token);
    const list = (query = '', token = adminToken) =>
        app.inject({ method: 'GET', url: `${BASE}${query}`, headers: as(token) });
    const errorOf = (res: { body: string }) => JSON.parse(res.body).error;

    describe('criação', () => {
        it('só texto: título e mensagem sem espaços nas pontas, sem mídia', async () => {
            const res = await create([field('title', '  Saudação  '), field('message', '  Olá!  ')]);
            expect(res.statusCode).toBe(201);
            expect(JSON.parse(res.body)).toMatchObject({
                company_id: companyId, title: 'Saudação', message: 'Olá!',
                media_path: null, media_type: null, media_size: null,
            });
        });

        it('com arquivo: grava em uploads/quick-messages/<empresa>/ e guarda tipo e tamanho', async () => {
            const res = await create([field('title', 'Catálogo'), png()]);
            expect(res.statusCode).toBe(201);
            const body = JSON.parse(res.body);
            expect(body.message).toBeNull();
            expect(body.media_path).toMatch(new RegExp(`^uploads/quick-messages/${companyId}/\\d+-[0-9a-f-]+\\.png$`));
            expect(body).toMatchObject({ media_type: 'image/png', media_size: PNG.length });
            expect(onDisk(body.media_path)).toBe(true);
        });

        it.each([
            [[field('message', 'oi')],                          'Campo "title" é obrigatório'],
            [[field('title', '   '), field('message', 'oi')],   'Campo "title" é obrigatório'],
            [[field('title', 'Vazia'), field('message', '  ')], 'É obrigatório ter mensagem de texto ou arquivo de mídia'],
            [[field('title', 'Txt'), { name: 'file', filename: 'a.txt', mime: 'text/plain', data: Buffer.from('x') }],
                'Tipo de arquivo não permitido: text/plain'],
        ])('400 #%#', async (parts, message) => {
            const res = await create(parts as Part[]);
            expect(res.statusCode).toBe(400);
            expect(errorOf(res)).toBe(message);
        });

        it('400 não deixa arquivo órfão no disco', async () => {
            const before = filesInCompanyDir().length;
            const res = await create([png(), field('message', 'sem título')]);
            expect(res.statusCode).toBe(400);
            expect(filesInCompanyDir().length).toBe(before);
        });

        it('atendente também cria', async () => {
            const res = await create([field('title', 'Do atendente'), field('message', 'x')], attendantToken);
            expect(res.statusCode).toBe(201);
        });
    });

    describe('listagem', () => {
        beforeAll(async () => {
            for (let i = 1; i <= 12; i++) {
                await create([field('title', `Lote ${String(i).padStart(2, '0')}`), field('message', 'x')]);
            }
            await create([field('title', 'Desconto 50% hoje'), field('message', 'x')]);
            await create([field('title', 'Outra empresa'), field('message', 'x')], otherToken);
        });

        it('pagina com 10 por padrão, mais antigas primeiro', async () => {
            const body = JSON.parse((await list()).body);
            expect(body).toMatchObject({ page: 1, limit: 10 });
            expect(body.data).toHaveLength(10);
            expect(body.totalPages).toBe(Math.ceil(body.total / 10));
            const dates = body.data.map((m: { created_at: string }) => new Date(m.created_at).getTime());
            expect([...dates].sort((a, b) => a - b)).toEqual(dates);
        });

        it('limit fica entre 1 e 50; page mínima é 1', async () => {
            expect(JSON.parse((await list('?limit=500')).body).limit).toBe(50);
            expect(JSON.parse((await list('?limit=0')).body).limit).toBe(1);
            expect(JSON.parse((await list('?page=-3')).body).page).toBe(1);
        });

        it('page/limit não numéricos usam o padrão (antes: 500)', async () => {
            const res = await list('?page=abc&limit=xyz');
            expect(res.statusCode).toBe(200);
            expect(JSON.parse(res.body)).toMatchObject({ page: 1, limit: 10 });
        });

        it('busca no título sem diferenciar maiúsculas, só da empresa', async () => {
            const body = JSON.parse((await list('?search=lote&limit=50')).body);
            expect(body.total).toBe(12);
            expect(body.data.every((m: { company_id: string }) => m.company_id === companyId)).toBe(true);
            expect(JSON.parse((await list('?search=Outra%20empresa')).body).total).toBe(0);
        });

        it('% e _ na busca são literais, não curingas', async () => {
            const pct = JSON.parse((await list(`?search=${encodeURIComponent('50%')}`)).body);
            expect(pct.data.map((m: { title: string }) => m.title)).toEqual(['Desconto 50% hoje']);
            expect(JSON.parse((await list('?search=_')).body).total).toBe(0);
        });
    });

    describe('edição', () => {
        it('campos não enviados são mantidos', async () => {
            const created = JSON.parse((await create([field('title', 'Original'), field('message', 'Texto')])).body);
            const res = await update(created.id, [field('title', ' Renomeada ')]);
            expect(res.statusCode).toBe(200);
            expect(JSON.parse(res.body)).toMatchObject({ title: 'Renomeada', message: 'Texto' });
        });

        it('message vazio apaga o texto (é assim que o front limpa o campo)', async () => {
            const created = JSON.parse((await create([field('title', 'Limpar'), field('message', 'Texto'), png()])).body);
            const res = await update(created.id, [field('title', 'Limpar'), field('message', '')]);
            expect(res.statusCode).toBe(200);
            expect(JSON.parse(res.body)).toMatchObject({ message: null, media_path: created.media_path });
        });

        it('arquivo novo substitui o antigo e apaga o antigo do disco', async () => {
            const created = JSON.parse((await create([field('title', 'Mídia'), png('a.png')])).body);
            const res = await update(created.id, [png('b.png')]);
            const body = JSON.parse(res.body);
            expect(body.media_path).not.toBe(created.media_path);
            expect(onDisk(body.media_path)).toBe(true);
            expect(onDisk(created.media_path)).toBe(false);
        });

        it('remove_media=true limpa a mídia e apaga o arquivo', async () => {
            const created = JSON.parse((await create([field('title', 'Com texto'), field('message', 'oi'), png()])).body);
            const res = await update(created.id, [field('remove_media', 'true')]);
            expect(JSON.parse(res.body)).toMatchObject({ media_path: null, media_type: null, media_size: null, message: 'oi' });
            expect(onDisk(created.media_path)).toBe(false);
        });

        it('arquivo novo + remove_media=true: o arquivo novo vence', async () => {
            const created = JSON.parse((await create([field('title', 'Troca'), png('a.png')])).body);
            const res = await update(created.id, [field('remove_media', 'true'), png('b.png')]);
            const body = JSON.parse(res.body);
            expect(body.media_path).toMatch(/\.png$/);
            expect(onDisk(body.media_path)).toBe(true);
            expect(onDisk(created.media_path)).toBe(false);
        });

        it('400 se o título ficar vazio', async () => {
            const created = JSON.parse((await create([field('title', 'T'), field('message', 'm')])).body);
            const res = await update(created.id, [field('title', '  ')]);
            expect(res.statusCode).toBe(400);
            expect(errorOf(res)).toBe('Campo "title" é obrigatório');
        });

        it('400 se a mensagem ficar sem texto e sem mídia; arquivo continua no disco', async () => {
            const created = JSON.parse((await create([field('title', 'Só mídia'), png()])).body);
            const res = await update(created.id, [field('remove_media', 'true')]);
            expect(res.statusCode).toBe(400);
            expect(errorOf(res)).toBe('É obrigatório ter mensagem de texto ou arquivo de mídia');
            expect(onDisk(created.media_path)).toBe(true);
        });

        it('404 para outra empresa, sem deixar o arquivo enviado no disco', async () => {
            const created = JSON.parse((await create([field('title', 'Minha'), field('message', 'm')])).body);
            const otherDir = path.join(process.cwd(), 'uploads', 'quick-messages', otherCompanyId);
            const before = fs.existsSync(otherDir) ? fs.readdirSync(otherDir).length : 0;
            const res = await update(created.id, [png()], otherToken);
            expect(res.statusCode).toBe(404);
            expect(errorOf(res)).toBe('Mensagem rápida não encontrada');
            expect(fs.existsSync(otherDir) ? fs.readdirSync(otherDir).length : 0).toBe(before);
            const [row] = await db.select().from(quickMessages).where(eq(quickMessages.id, created.id));
            expect(row.media_path).toBeNull();
        });

        it('id não numérico → 400 (antes: 500)', async () => {
            const res = await app.inject({ method: 'DELETE', url: `${BASE}/abc`, headers: as(adminToken) });
            expect(res.statusCode).toBe(400);
            expect(errorOf(res)).toBe('id inválido');
        });
    });

    describe('remoção', () => {
        it('204 apaga o registro e o arquivo; depois 404', async () => {
            const created = JSON.parse((await create([field('title', 'Apagar'), png()])).body);
            const del = await app.inject({ method: 'DELETE', url: `${BASE}/${created.id}`, headers: as(adminToken) });
            expect(del.statusCode).toBe(204);
            expect(onDisk(created.media_path)).toBe(false);
            const again = await app.inject({ method: 'DELETE', url: `${BASE}/${created.id}`, headers: as(adminToken) });
            expect(again.statusCode).toBe(404);
        });

        it('outra empresa → 404 e não apaga', async () => {
            const created = JSON.parse((await create([field('title', 'Protegida'), png()])).body);
            const del = await app.inject({ method: 'DELETE', url: `${BASE}/${created.id}`, headers: as(otherToken) });
            expect(del.statusCode).toBe(404);
            expect(onDisk(created.media_path)).toBe(true);
        });
    });
});
