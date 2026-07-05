import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { generateSync } from 'otplib';
import jwt from 'jsonwebtoken';
import { db } from '../../src/database/client';
import { users } from '../../src/modules/auth/auth.schema';
import { buildApp } from '../../src/shared/server';
import { runSeed } from '../../src/database/seed';
import { env } from '../../src/config/env';

/**
 * 2FA TOTP do superAdmin. ATENÇÃO: este arquivo roda por último e RESTAURA o
 * estado do filipe no afterAll — os demais arquivos da suíte logam como ele.
 */

const app = buildApp();

async function resetFilipeTotp() {
    await db.update(users)
        .set({ totp_secret: null, totp_enabled: false, totp_recovery_codes: null })
        .where(eq(users.email, 'filipe@kelmor.com'));
}

async function login(email: string, password: string) {
    return app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });
}

function secretFromOtpauth(otpauth: string): string {
    return new URL(otpauth).searchParams.get('secret')!;
}

let superToken: string;

beforeAll(async () => {
    await app.ready();
    await runSeed();
    await resetFilipeTotp(); // defensivo: estado limpo mesmo após rodada abortada
    const res = await login('filipe@kelmor.com', 'kelmor123');
    superToken = JSON.parse(res.body).access_token;
});

afterAll(async () => {
    await resetFilipeTotp(); // OBRIGATÓRIO: próxima rodada da suíte depende disso
    await app.close();
});

describe('Setup e ativação do TOTP', () => {
    let secret: string;

    it('GET /auth/totp/setup devolve otpauth com o segredo', async () => {
        const res = await app.inject({
            method: 'GET', url: '/api/v1/auth/totp/setup',
            headers: { authorization: `Bearer ${superToken}` },
        });
        expect(res.statusCode).toBe(200);
        const { otpauth } = JSON.parse(res.body);
        expect(otpauth).toContain('otpauth://totp/');
        secret = secretFromOtpauth(otpauth);
        expect(secret.length).toBeGreaterThan(10);
    });

    it('enable com código errado → 400', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/v1/auth/totp/enable',
            headers: { authorization: `Bearer ${superToken}` },
            payload: { code: '000000' },
        });
        expect(res.statusCode).toBe(400);
    });

    it('enable com código válido ativa e devolve 10 códigos de recuperação', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/v1/auth/totp/enable',
            headers: { authorization: `Bearer ${superToken}` },
            payload: { code: generateSync({ secret }) },
        });
        expect(res.statusCode).toBe(200);
        const { recovery_codes } = JSON.parse(res.body);
        expect(recovery_codes).toHaveLength(10);
        expect(recovery_codes[0]).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);
    });

    it('GET /auth/me expõe totp_enabled=true', async () => {
        const res = await app.inject({
            method: 'GET', url: '/api/v1/auth/me',
            headers: { authorization: `Bearer ${superToken}` },
        });
        expect(JSON.parse(res.body).totp_enabled).toBe(true);
    });

    it('rotas de setup exigem superAdmin (admin comum → 403)', async () => {
        const adm = await login('dono@kelmor.com', 'kelmor123');
        const admToken = JSON.parse(adm.body).access_token;
        const res = await app.inject({
            method: 'GET', url: '/api/v1/auth/totp/setup',
            headers: { authorization: `Bearer ${admToken}` },
        });
        expect(res.statusCode).toBe(403);
    });
});

describe('Login em 2 passos', () => {
    let secret: string;
    let recovery: string[];

    beforeAll(async () => {
        // reconfigura do zero para conhecer o segredo
        await resetFilipeTotp();
        const l = await login('filipe@kelmor.com', 'kelmor123');
        const tk = JSON.parse(l.body).access_token;
        const setup = await app.inject({
            method: 'GET', url: '/api/v1/auth/totp/setup',
            headers: { authorization: `Bearer ${tk}` },
        });
        secret = secretFromOtpauth(JSON.parse(setup.body).otpauth);
        const en = await app.inject({
            method: 'POST', url: '/api/v1/auth/totp/enable',
            headers: { authorization: `Bearer ${tk}` },
            payload: { code: generateSync({ secret }) },
        });
        recovery = JSON.parse(en.body).recovery_codes;
    });

    async function step2(ticket: string, code: string) {
        return app.inject({ method: 'POST', url: '/api/v1/auth/login/totp', payload: { ticket, code } });
    }

    it('senha correta NÃO emite sessão: devolve requires_totp + ticket, sem cookie', async () => {
        const res = await login('filipe@kelmor.com', 'kelmor123');
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.requires_totp).toBe(true);
        expect(body.totp_ticket).toBeTruthy();
        expect(body.access_token).toBeUndefined();
        expect(res.cookies.find((c: { name: string }) => c.name === 'refresh_token')).toBeUndefined();
    });

    it('passo 2 com código do app emite a sessão; reuso do ticket → 401', async () => {
        const l = await login('filipe@kelmor.com', 'kelmor123');
        const { totp_ticket } = JSON.parse(l.body);

        const ok = await step2(totp_ticket, generateSync({ secret }));
        expect(ok.statusCode).toBe(200);
        const body = JSON.parse(ok.body);
        expect(body.access_token).toBeTruthy();
        expect(body.user.profile_tag).toBe('superAdmin');
        expect(ok.cookies.find((c: { name: string }) => c.name === 'refresh_token')).toBeTruthy();

        const reuse = await step2(totp_ticket, generateSync({ secret }));
        expect(reuse.statusCode).toBe(401);
    });

    it('código errado → 401 "Código inválido" (ticket segue utilizável)', async () => {
        const l = await login('filipe@kelmor.com', 'kelmor123');
        const { totp_ticket } = JSON.parse(l.body);
        const bad = await step2(totp_ticket, '000000');
        expect(bad.statusCode).toBe(401);
        expect(JSON.parse(bad.body).message).toBe('Código inválido');
        const good = await step2(totp_ticket, generateSync({ secret }));
        expect(good.statusCode).toBe(200);
    });

    it('ticket com purpose errado / forjado → 401', async () => {
        const forged = jwt.sign({ sub: 'x', purpose: 'access', jti: 'abc' }, env.JWT_SECRET, { expiresIn: '5m' });
        const res = await step2(forged, generateSync({ secret }));
        expect(res.statusCode).toBe(401);
    });

    it('código de recuperação entra UMA única vez', async () => {
        const l1 = await login('filipe@kelmor.com', 'kelmor123');
        const ok = await step2(JSON.parse(l1.body).totp_ticket, recovery[0]);
        expect(ok.statusCode).toBe(200);

        const l2 = await login('filipe@kelmor.com', 'kelmor123');
        const again = await step2(JSON.parse(l2.body).totp_ticket, recovery[0]);
        expect(again.statusCode).toBe(401);
    });

    it('usuário sem TOTP loga direto como sempre', async () => {
        const res = await login('dono@kelmor.com', 'kelmor123');
        const body = JSON.parse(res.body);
        expect(body.access_token).toBeTruthy();
        expect(body.requires_totp).toBeUndefined();
    });

    it('ticket do 2FA NÃO vale como access token (Bearer em /auth/me → 401)', async () => {
        const l = await login('filipe@kelmor.com', 'kelmor123');
        const { totp_ticket } = JSON.parse(l.body);
        const res = await app.inject({
            method: 'GET', url: '/api/v1/auth/me',
            headers: { authorization: `Bearer ${totp_ticket}` },
        });
        expect(res.statusCode).toBe(401);
    });
});
