import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { queues, connections, userQueues } from '../../src/modules/atendimento/atendimento.db.schema';
import { userAvatars } from '../../src/modules/meu-perfil/meu-perfil.db.schema';
import { runSeed } from '../../src/database/seed';
import { buildApp } from '../../src/shared/server';

/** "Meu perfil": dados do próprio usuário, apelido, filas/conexões (só admin) e avatar. */

const SUFFIX = Date.now();
const BASE = '/api/v1/configuracao/meu-perfil';
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');

function multipartFile(filename: string, mime: string, data: Buffer) {
    const boundary = `----kelmor${SUFFIX}`;
    const payload = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`),
        data,
        Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return { payload, contentType: `multipart/form-data; boundary=${boundary}` };
}

const onDisk = (url: string) => fs.existsSync(path.join(process.cwd(), url.replace(/^\//, '')));

describe('Meu perfil', () => {
    const app = buildApp();
    let companyId: string;
    let adminId: string;
    let attendantId: string;
    let adminToken: string;
    let attendantToken: string;
    let superAdminToken: string;
    let ownQueues: number[];
    let ownConnection: number;
    let foreignQueue: number;

    beforeAll(async () => {
        await app.ready();
        await runSeed();
        const [userProfile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'user'));
        const [adminProfile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'admin'));

        async function makeCompany(label: string) {
            const [co] = await db.insert(companies)
                .values({ name: `Empresa MeuPerfil ${label} ${SUFFIX}`, status: true })
                .returning({ id: companies.id });
            return co.id;
        }
        async function login(email: string, password: string) {
            const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });
            return JSON.parse(res.body).access_token as string;
        }
        async function makeUser(label: string, profileId: number, coId: string) {
            const email = `meu-perfil-${label}-${SUFFIX}@test.com`;
            const [u] = await db.insert(users).values({
                name: `Nome ${label}`, email, password_hash: hashSync('senha123', 10),
                profile_id: profileId, company_id: coId,
                email_verified: true, is_approved: true,
            }).returning({ id: users.id });
            return { id: u.id, token: await login(email, 'senha123') };
        }

        companyId = await makeCompany('A');
        const otherCompanyId = await makeCompany('B');
        const admin = await makeUser('admin', adminProfile.id, companyId);
        const attendant = await makeUser('attendant', userProfile.id, companyId);
        adminId = admin.id; adminToken = admin.token;
        attendantId = attendant.id; attendantToken = attendant.token;
        superAdminToken = await login('filipe@kelmor.com', 'kelmor123');

        const qs = await db.insert(queues)
            .values([{ company_id: companyId, name: 'Vendas' }, { company_id: companyId, name: 'Suporte' }])
            .returning({ id: queues.id });
        ownQueues = qs.map((q) => q.id);
        const [conn] = await db.insert(connections).values({ company_id: companyId, name: 'WhatsApp A' }).returning({ id: connections.id });
        ownConnection = conn.id;
        const [fq] = await db.insert(queues).values({ company_id: otherCompanyId, name: 'Fila alheia' }).returning({ id: queues.id });
        foreignQueue = fq.id;
    });

    afterAll(async () => {
        await app.close();
        for (const id of [adminId, attendantId]) {
            fs.rmSync(path.join(process.cwd(), 'uploads', 'avatars', id), { recursive: true, force: true });
        }
    });

    const as = (token: string) => ({ authorization: `Bearer ${token}` });
    const getProfile = async (token = adminToken) => JSON.parse((await app.inject({ method: 'GET', url: BASE, headers: as(token) })).body);
    const put = (payload: Record<string, unknown>, token = adminToken) =>
        app.inject({ method: 'PUT', url: BASE, headers: as(token), payload });
    const uploadAvatar = (filename: string, mime: string, data: Buffer, token = adminToken) => {
        const { payload, contentType } = multipartFile(filename, mime, data);
        return app.inject({ method: 'POST', url: `${BASE}/avatar`, payload, headers: { ...as(token), 'content-type': contentType } });
    };
    const messageOf = (res: { body: string }) => JSON.parse(res.body).message;

    describe('leitura', () => {
        it('devolve os dados do próprio usuário com perfil, filas e conexões', async () => {
            const body = await getProfile(attendantToken);
            expect(body).toMatchObject({
                id: attendantId, name: 'Nome attendant', nickname: null, email: `meu-perfil-attendant-${SUFFIX}@test.com`,
                profile_tag: 'user', avatar_url: null, hide_name_active: false, queue_ids: [], connection_ids: [],
            });
            expect(body).not.toHaveProperty('password_hash');
        });

        it('opções de filas e conexões são só as da empresa', async () => {
            const res = await app.inject({ method: 'GET', url: `${BASE}/selects`, headers: as(attendantToken) });
            const body = JSON.parse(res.body);
            expect(body.queues.map((q: { id: number }) => q.id).sort()).toEqual([...ownQueues].sort());
            expect(body.connections.map((c: { id: number }) => c.id)).toEqual([ownConnection]);
        });

        it('superAdmin (sem empresa) vê listas vazias de opções', async () => {
            const res = await app.inject({ method: 'GET', url: `${BASE}/selects`, headers: as(superAdminToken) });
            expect(res.statusCode).toBe(200);
            expect(JSON.parse(res.body)).toEqual({ queues: [], connections: [] });
        });
    });

    describe('edição', () => {
        it('apelido: sem espaços nas pontas; vazio volta a null', async () => {
            expect((await put({ nickname: '  Fifi  ' }, attendantToken)).statusCode).toBe(200);
            expect((await getProfile(attendantToken)).nickname).toBe('Fifi');
            await put({ nickname: '   ' }, attendantToken);
            expect((await getProfile(attendantToken)).nickname).toBeNull();
        });

        it('modo "esconder meu nome" liga e desliga', async () => {
            await put({ hide_name_active: true }, attendantToken);
            expect((await getProfile(attendantToken)).hide_name_active).toBe(true);
            await put({ hide_name_active: false }, attendantToken);
            expect((await getProfile(attendantToken)).hide_name_active).toBe(false);
        });

        it('atendente não muda as próprias filas/conexões (403)', async () => {
            const res = await put({ queue_ids: ownQueues }, attendantToken);
            expect(res.statusCode).toBe(403);
            expect(messageOf(res)).toBe('Apenas administradores podem alterar suas conexões e filas');
        });

        it('admin substitui as próprias filas e conexões; ids de outra empresa são ignorados', async () => {
            const res = await put({ queue_ids: [...ownQueues, foreignQueue], connection_ids: [ownConnection] });
            expect(res.statusCode).toBe(200);
            expect(JSON.parse(res.body)).toEqual({ ok: true });
            const body = await getProfile();
            expect(body.queue_ids.sort()).toEqual([...ownQueues].sort());
            expect(body.connection_ids).toEqual([ownConnection]);

            await put({ queue_ids: [ownQueues[0]] });
            expect((await getProfile()).queue_ids).toEqual([ownQueues[0]]);
            await put({ connection_ids: [] });
            expect((await getProfile()).connection_ids).toEqual([]);
        });

        it.each([
            [{ nickname: 42 },                'nickname inválido'],
            [{ nickname: 'x'.repeat(101) },   'nickname deve ter no máximo 100 caracteres'],
            [{ hide_name_active: 'sim' },     'hide_name_active inválido'],
            [{ queue_ids: 'todas' },          'queue_ids inválido'],
            [{ connection_ids: [1, 'x'] },    'connection_ids inválido'],
        ])('400 para %j, sem mexer nas filas', async (payload, message) => {
            await put({ queue_ids: [ownQueues[1]] });
            const res = await put(payload);
            expect(res.statusCode).toBe(400);
            expect(messageOf(res)).toBe(message);
            const rows = await db.select().from(userQueues).where(eq(userQueues.user_id, adminId));
            expect(rows.map((r) => r.queue_id)).toEqual([ownQueues[1]]);
        });
    });

    describe('avatar', () => {
        it('envia a foto: 201 com a URL, arquivo gravado e perfil atualizado', async () => {
            const res = await uploadAvatar('Eu.PNG', 'image/png', PNG);
            expect(res.statusCode).toBe(201);
            const { avatar_url } = JSON.parse(res.body);
            expect(avatar_url).toMatch(new RegExp(`^/uploads/avatars/${adminId}/.+\\.png$`));
            expect(onDisk(avatar_url)).toBe(true);
            expect((await getProfile()).avatar_url).toBe(avatar_url);
        });

        it('trocar a foto apaga a antiga do disco e mantém um registro por usuário', async () => {
            const first = JSON.parse((await uploadAvatar('a.png', 'image/png', PNG)).body).avatar_url;
            const second = JSON.parse((await uploadAvatar('b.webp', 'image/webp', PNG)).body).avatar_url;
            expect(second).not.toBe(first);
            expect(onDisk(first)).toBe(false);
            expect(onDisk(second)).toBe(true);
            const rows = await db.select().from(userAvatars).where(eq(userAvatars.user_id, adminId));
            expect(rows).toHaveLength(1);
            expect(rows[0]).toMatchObject({ url: second, original_name: 'b.webp', mime_type: 'image/webp', size_bytes: PNG.length });
        });

        it('formato não aceito → 400 e a foto atual continua', async () => {
            const current = (await getProfile()).avatar_url;
            const res = await uploadAvatar('doc.pdf', 'application/pdf', PNG);
            expect(res.statusCode).toBe(400);
            expect(messageOf(res)).toBe('Formato inválido. Use JPG, PNG ou WEBP.');
            expect((await getProfile()).avatar_url).toBe(current);
            expect(onDisk(current)).toBe(true);
        });

        it('maior que 5MB → 413, sem deixar arquivo e sem trocar a foto atual', async () => {
            const current = (await getProfile()).avatar_url;
            const before = fs.readdirSync(path.join(process.cwd(), 'uploads', 'avatars', adminId)).length;
            const res = await uploadAvatar('grande.jpg', 'image/jpeg', Buffer.alloc(5 * 1024 * 1024 + 1));
            expect(res.statusCode).toBe(413);
            expect(messageOf(res)).toBe('Arquivo maior que 5MB');
            expect((await getProfile()).avatar_url).toBe(current);
            expect(fs.readdirSync(path.join(process.cwd(), 'uploads', 'avatars', adminId)).length).toBe(before);
        });

        it('sem arquivo → 400', async () => {
            const boundary = `----vazio${SUFFIX}`;
            const res = await app.inject({
                method: 'POST', url: `${BASE}/avatar`,
                payload: Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="x"\r\n\r\n1\r\n--${boundary}--\r\n`),
                headers: { ...as(adminToken), 'content-type': `multipart/form-data; boundary=${boundary}` },
            });
            expect(res.statusCode).toBe(400);
            expect(messageOf(res)).toBe('Arquivo não enviado');
        });
    });
});
