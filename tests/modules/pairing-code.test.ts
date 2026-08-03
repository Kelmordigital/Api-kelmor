import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { db } from '../../src/database/client';
import { getRedisClient } from '../../src/config/redis';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { connections } from '../../src/modules/atendimento/atendimento.db.schema';
import { whatsappService } from '../../src/modules/whatsapp/whatsapp.service';
import { buildApp } from '../../src/shared/server';

const SUFFIX = Date.now();
let companyId: string;
let token: string;
let connId: number;

describe('Código de pareamento (pairing code)', () => {
    const app = buildApp();
    const originalFetch = global.fetch;

    beforeAll(async () => {
        await app.ready();
        const [profile] = await db.select({ id: profiles.id })
            .from(profiles).where(eq(profiles.tag, 'admin'));

        const [co] = await db.insert(companies)
            .values({ name: `Empresa PairingCode ${SUFFIX}`, status: true })
            .returning({ id: companies.id });
        companyId = co.id;

        await db.insert(users).values({
            name: 'pairing-admin', email: `pairing-code-${SUFFIX}@test.com`,
            password_hash: hashSync('senha123', 10),
            profile_id: profile.id, company_id: companyId,
            email_verified: true, is_approved: true,
        });

        const [conn] = await db.insert(connections)
            .values({ company_id: companyId, name: 'Conexão Pareamento' })
            .returning({ id: connections.id });
        connId = conn.id;

        const login = await app.inject({
            method: 'POST', url: '/api/v1/auth/login',
            payload: { email: `pairing-code-${SUFFIX}@test.com`, password: 'senha123' },
        });
        token = JSON.parse(login.body).access_token;
    });

    afterEach(() => {
        global.fetch = originalFetch;
        vi.restoreAllMocks();
    });

    describe('POST /whatsapp/connections/:id/pairing-code', () => {
        it('recusa com 400 quando phoneNumber não é informado', async () => {
            const res = await app.inject({
                method: 'POST', url: `/api/v1/whatsapp/connections/${connId}/pairing-code`,
                headers: { authorization: `Bearer ${token}` },
                payload: {},
            });
            expect(res.statusCode).toBe(400);
        });

        it('aciona whatsappService.requestPairingCode e retorna 202 quando phoneNumber é informado', async () => {
            const spy = vi.spyOn(whatsappService, 'requestPairingCode').mockResolvedValue(undefined);

            const res = await app.inject({
                method: 'POST', url: `/api/v1/whatsapp/connections/${connId}/pairing-code`,
                headers: { authorization: `Bearer ${token}` },
                payload: { phoneNumber: '5511999999999' },
            });

            expect(res.statusCode).toBe(202);
            expect(spy).toHaveBeenCalledWith(connId, '5511999999999');
        });
    });

    describe('whatsappService.requestPairingCode', () => {
        it('apaga sessão antiga no bays antes de pedir o código no modo pareamento', async () => {
            const calls: { url: string; method?: string; body?: string }[] = [];
            global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
                calls.push({ url: String(url), method: init?.method, body: init?.body as string });
                return new Response(JSON.stringify({ message: 'ok' }), { status: 200 });
            }) as unknown as typeof fetch;

            await whatsappService.requestPairingCode(connId, '5511999999999');

            const deleteCall = calls.find(c => c.method === 'DELETE');
            const postCall = calls.find(c => c.method === 'POST' && c.url.includes('/pairing-code/'));
            expect(deleteCall).toBeDefined();
            expect(postCall).toBeDefined();
            expect(JSON.parse(postCall!.body!)).toMatchObject({ phoneNumber: '5511999999999' });
        });
    });

    describe('whatsappService.handleConnectionUpdate — pairing-code', () => {
        it('guarda o código recebido e deixa getStatus devolver pairing_ready', async () => {
            await whatsappService.handleConnectionUpdate(connId, {
                type: 'pairing-code',
                pairingCode: 'ABCD1234',
            });

            const status = await whatsappService.getStatus(connId);
            expect(status).toEqual({ status: 'pairing_ready', pairingCode: 'ABCD1234' });
        });

        it('limpa o código de pareamento salvo quando a conexão finalmente conecta', async () => {
            await whatsappService.handleConnectionUpdate(connId, {
                type: 'pairing-code',
                pairingCode: 'WXYZ5678',
            });

            await whatsappService.handleConnectionUpdate(connId, { type: 'connected' });

            const redis = getRedisClient();
            const stored = await redis?.get(`wa:pairing:${connId}`);
            expect(stored).toBeNull();
        });
    });
});