import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { io as connectClient, type Socket } from 'socket.io-client';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { getRedisClient } from '../../src/config/redis';
import { sessionKey } from '../../src/core/auth/session';
import { runSeed } from '../../src/database/seed';
import { buildApp } from '../../src/shared/server';
import { emitToCompany, emitToUser, initSocket, isUserOnline } from '../../src/shared/socket';

/** Tempo real (Socket.IO): salas por empresa e por usuário, presença online. */

const SUFFIX = Date.now();
const app = buildApp();
let url: string;
let companyA: string;
let companyB: string;
let userA: { id: string; token: string };
let colleagueA: { id: string; token: string };
let userB: { id: string; token: string };
const open: Socket[] = [];

async function login(email: string) {
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: 'senha123' } });
    return JSON.parse(res.body).access_token as string;
}

/** Conecta como o front: token no handshake e pedido para entrar nas salas. */
function connect(opts: { token?: string; join?: { companyId?: string; userId?: string } } = {}): Promise<Socket> {
    const socket = connectClient(url, {
        transports: ['websocket'], reconnection: false, forceNew: true,
        auth: opts.token ? { token: opts.token } : {},
    });
    open.push(socket);
    return new Promise((resolve, reject) => {
        socket.on('connect', () => {
            if (opts.join?.companyId) socket.emit('join:company', { companyId: opts.join.companyId });
            if (opts.join?.userId) socket.emit('join:user', { userId: opts.join.userId });
            setTimeout(() => resolve(socket), 150); // tempo para o servidor processar as entradas
        });
        socket.on('connect_error', (err) => reject(err));
    });
}

/** Payload do próximo evento, ou 'nada' se não chegar em `ms`. */
function next(socket: Socket, event: string, ms = 400): Promise<unknown> {
    return new Promise((resolve) => {
        const timer = setTimeout(() => { socket.off(event, handler); resolve('nada'); }, ms);
        const handler = (payload: unknown) => { clearTimeout(timer); resolve(payload); };
        socket.once(event, handler);
    });
}

const settle = (ms = 200) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
    await runSeed();
    const tags = await db.select({ id: profiles.id, tag: profiles.tag }).from(profiles);
    const profileId = (tag: string) => tags.find((p) => p.tag === tag)!.id;
    const [a, b] = await db.insert(companies).values([
        { name: `Socket A ${SUFFIX}`, status: true }, { name: `Socket B ${SUFFIX}`, status: true },
    ]).returning({ id: companies.id });
    companyA = a.id;
    companyB = b.id;
    const person = (name: string, companyId: string) => ({
        name, email: `sock-${name}-${SUFFIX}@test.com`, password_hash: hashSync('senha123', 10),
        profile_id: profileId('user'), company_id: companyId, email_verified: true, is_approved: true,
    });
    const [ua, ca, ub] = await db.insert(users).values([person('ua', companyA), person('ca', companyA), person('ub', companyB)]).returning({ id: users.id });
    userA = { id: ua.id, token: await login(`sock-ua-${SUFFIX}@test.com`) };
    colleagueA = { id: ca.id, token: await login(`sock-ca-${SUFFIX}@test.com`) };
    userB = { id: ub.id, token: await login(`sock-ub-${SUFFIX}@test.com`) };

    await app.listen({ port: 0, host: '127.0.0.1' });
    initSocket(app.server);
    const address = app.server.address();
    url = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});

afterEach(async () => {
    while (open.length) open.pop()!.disconnect();
    await settle(); // o servidor processa as desconexões (presença) antes do próximo teste
});

afterAll(async () => {
    await db.delete(users).where(inArray(users.company_id, [companyA, companyB]));
    await db.delete(companies).where(inArray(companies.id, [companyA, companyB]));
    await app.close();
});

describe('Salas da empresa e do usuário', () => {
    it('quem está na sala da empresa recebe os eventos dela, e não os de outra empresa', async () => {
        const a = await connect({ token: userA.token, join: { companyId: companyA, userId: userA.id } });
        const b = await connect({ token: userB.token, join: { companyId: companyB, userId: userB.id } });
        const gotA = next(a, 'ticket:updated');
        const gotB = next(b, 'ticket:updated');
        emitToCompany(companyA, 'ticket:updated', { id: 1 });
        expect(await gotA).toEqual({ id: 1 });
        expect(await gotB).toBe('nada');
    });

    it('evento pessoal chega só às abas do próprio usuário', async () => {
        const mine = await connect({ token: userA.token, join: { companyId: companyA, userId: userA.id } });
        const colleague = await connect({ token: colleagueA.token, join: { companyId: companyA, userId: colleagueA.id } });
        const gotMine = next(mine, 'notification:new');
        const gotColleague = next(colleague, 'notification:new');
        emitToUser(userA.id, 'notification:new', { title: 'oi' });
        expect(await gotMine).toEqual({ title: 'oi' });
        expect(await gotColleague).toBe('nada');
    });
});

describe('Presença online', () => {
    it('online enquanto houver uma aba aberta; offline quando a última fecha', async () => {
        expect(isUserOnline(colleagueA.id)).toBe(false);
        const tab1 = await connect({ token: colleagueA.token, join: { companyId: companyA, userId: colleagueA.id } });
        const tab2 = await connect({ token: colleagueA.token, join: { companyId: companyA, userId: colleagueA.id } });
        expect(isUserOnline(colleagueA.id)).toBe(true);
        tab1.disconnect();
        await settle();
        expect(isUserOnline(colleagueA.id)).toBe(true);
        tab2.disconnect();
        await settle();
        expect(isUserOnline(colleagueA.id)).toBe(false);
    });
});

describe('[correção] Autenticação do socket', () => {
    it('sem token, a conexão é recusada', async () => {
        await expect(connect({ join: { companyId: companyA } })).rejects.toThrow('Não autorizado');
    });

    it('token inválido ou de sessão encerrada é recusado', async () => {
        await expect(connect({ token: 'lixo' })).rejects.toThrow('Não autorizado');

        const ghost = await login(`sock-ub-${SUFFIX}@test.com`);
        const redis = getRedisClient()!;
        const key = sessionKey('user', companyB, userB.id);
        const saved = await redis.get(key);
        await redis.del(key); // ex.: logout, revogação ou empresa desativada
        try {
            await expect(connect({ token: ghost })).rejects.toThrow('Não autorizado');
        } finally {
            if (saved) await redis.set(key, saved, 'EX', 7 * 24 * 3600);
        }
    });

    it('não dá para entrar na sala de outra empresa', async () => {
        const spy = await connect({ token: userB.token, join: { companyId: companyA } });
        const got = next(spy, 'ticket:updated');
        emitToCompany(companyA, 'ticket:updated', { secreto: true });
        expect(await got).toBe('nada');
    });

    it('não dá para entrar na sala de outro usuário nem aparecer online por ele', async () => {
        const spy = await connect({ token: userB.token, join: { userId: colleagueA.id } });
        const got = next(spy, 'notification:new');
        emitToUser(colleagueA.id, 'notification:new', { secreto: true });
        expect(await got).toBe('nada');
        expect(isUserOnline(colleagueA.id)).toBe(false);
    });

    it('entra sozinho nas próprias salas, sem precisar pedir', async () => {
        const socket = await connect({ token: userA.token });
        const company = next(socket, 'ticket:updated');
        emitToCompany(companyA, 'ticket:updated', { id: 2 });
        expect(await company).toEqual({ id: 2 });
        const personal = next(socket, 'notification:new');
        emitToUser(userA.id, 'notification:new', { id: 3 });
        expect(await personal).toEqual({ id: 3 });
        expect(isUserOnline(userA.id)).toBe(true);
    });
});
