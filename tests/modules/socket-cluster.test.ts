import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server as HttpServer } from 'http';
import { eq, inArray } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { io as connectClient, type Socket } from 'socket.io-client';
import type { Server } from 'socket.io';
import { db } from '../../src/database/client';
import { env } from '../../src/config/env';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { runSeed } from '../../src/database/seed';
import { buildApp } from '../../src/shared/server';
import { accessTokens } from '../../src/middlewares/auth.middleware';
import { closeSocketServer, createSocketServer, emitToCompany, getIo, initSocket, onlineUsers } from '../../src/shared/socket';

/** Duas cópias da API ligadas pelo Redis: evento e presença atravessam de uma para a outra. */
describe.skipIf(!env.REDIS_URL)('Socket.IO entre cópias da API (adapter Redis)', () => {
    const SUFFIX = Date.now();
    const app = buildApp();
    const httpA: HttpServer = createServer();
    const httpB: HttpServer = createServer();
    let serverB: Server;
    let client: Socket;
    let companyId: string;
    let userId: string;

    const listen = (s: HttpServer) => new Promise<number>((r) => s.listen(0, '127.0.0.1', () => r((s.address() as { port: number }).port)));
    const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms));

    beforeAll(async () => {
        await runSeed();
        const [profile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'user'));
        const [co] = await db.insert(companies).values({ name: `Cluster ${SUFFIX}`, status: true }).returning({ id: companies.id });
        companyId = co.id;
        const [u] = await db.insert(users).values({
            name: 'Cluster', email: `cluster-${SUFFIX}@test.com`, password_hash: hashSync('senha123', 10),
            profile_id: profile.id, company_id: companyId, email_verified: true, is_approved: true,
        }).returning({ id: users.id });
        userId = u.id;
        await app.ready();
        const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: `cluster-${SUFFIX}@test.com`, password: 'senha123' } });
        const token = JSON.parse(login.body).access_token as string;

        initSocket(httpA);                                              // cópia A (a "global")
        serverB = createSocketServer(httpB, accessTokens, env.REDIS_URL); // cópia B
        await listen(httpA);
        const portB = await listen(httpB);

        client = connectClient(`http://127.0.0.1:${portB}`, { transports: ['websocket'], reconnection: false, forceNew: true, auth: { token } });
        await new Promise<void>((resolve, reject) => { client.on('connect', () => resolve()); client.on('connect_error', reject); });
        await settle();
    });

    afterAll(async () => {
        client?.disconnect();
        await closeSocketServer(serverB);
        await closeSocketServer(getIo());
        httpA.close();
        httpB.close();
        await db.delete(users).where(eq(users.id, userId));
        await db.delete(companies).where(inArray(companies.id, [companyId]));
        await app.close();
    });

    it('evento emitido na cópia A chega ao cliente conectado na cópia B', async () => {
        const received = new Promise((resolve) => client.once('ping-cluster', resolve));
        emitToCompany(companyId, 'ping-cluster', { x: 1 });
        expect(await Promise.race([received, settle(2000).then(() => 'nada')])).toEqual({ x: 1 });
    });

    it('presença enxerga quem está conectado na outra cópia', async () => {
        expect(await onlineUsers([userId])).toEqual(new Set([userId]));
    });
});
