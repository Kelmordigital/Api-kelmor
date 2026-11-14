import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';

// Nunca consulta o Grafana de verdade (o .env local tem credenciais reais).
vi.mock('../../src/config/env', async (importOriginal) => {
    const original = await importOriginal<typeof import('../../src/config/env')>();
    return {
        env: {
            ...original.env,
            GRAFANA_PROM_URL: 'https://prometheus.test/api/prom/',
            GRAFANA_PROM_USER: '123456',
            GRAFANA_PROM_TOKEN: 'glc_teste',
            ALERT_WEBHOOK_TOKEN: 'token-de-teste-com-16chars',
            ALERT_CONNECTION_ID: '7',
            ALERT_PHONE: '5511999990000',
        },
    };
});

import { env } from '../../src/config/env';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { connections } from '../../src/modules/atendimento/atendimento.db.schema';
import { whatsappService } from '../../src/modules/whatsapp/whatsapp.service';
import { runSeed } from '../../src/database/seed';
import { buildApp } from '../../src/shared/server';

/** Monitoramento: /metrics, webhook de alertas do Grafana e histórico de métricas do painel Super Admin. */

const SUFFIX = Date.now();
const app = buildApp();
let superToken: string;
let adminToken: string;
let companyId: string;
const TOKEN = 'token-de-teste-com-16chars';

async function login(email: string, password: string) {
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });
    return JSON.parse(res.body).access_token as string;
}
const history = (token: string, query: string) =>
    app.inject({ method: 'GET', url: `/api/v1/superadmin/metrics/history?${query}`, headers: { authorization: `Bearer ${token}` } });
const body = (res: { body: string }) => JSON.parse(res.body);
/** Texto do erro: antes vinha só em `error`; agora em `message`, no formato das demais rotas do painel. */
const errorText = (res: { body: string }) => body(res).message ?? body(res).error;

/** Resposta do Prometheus (query_range) com as séries dadas. */
function prom(result: { metric?: Record<string, string>; values: [number, string][] }[]) {
    return { ok: true, status: 200, json: async () => ({ status: 'success', data: { resultType: 'matrix', result } }) };
}

let fetchMock: ReturnType<typeof vi.fn>;
const realFetch = globalThis.fetch;

beforeAll(async () => {
    await app.ready();
    await runSeed();
    const [admin] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'admin'));
    const [co] = await db.insert(companies).values({ name: `Empresa Monitoramento ${SUFFIX}`, status: true }).returning({ id: companies.id });
    companyId = co.id;
    await db.insert(users).values({
        name: 'Admin Mon', email: `mon-admin-${SUFFIX}@test.com`, password_hash: hashSync('senha123', 10),
        profile_id: admin.id, company_id: companyId, email_verified: true, is_approved: true,
    });
    superToken = await login('filipe@kelmor.com', 'kelmor123');
    adminToken = await login(`mon-admin-${SUFFIX}@test.com`, 'senha123');
});

beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    vi.stubGlobal('fetch', realFetch);
    vi.restoreAllMocks();
});

afterAll(async () => {
    await db.delete(connections).where(eq(connections.company_id, companyId));
    await db.delete(users).where(eq(users.company_id, companyId));
    await db.delete(companies).where(eq(companies.id, companyId));
    await app.close();
});

describe('Histórico de métricas (painel Super Admin)', () => {
    it('só o superAdmin consulta', async () => {
        expect((await history(adminToken, 'metric=cpu&range=1h')).statusCode).toBe(403);
    });

    it('valida métrica e período', async () => {
        const metric = await history(superToken, 'metric=disco&range=1h');
        expect(metric.statusCode).toBe(400);
        expect(errorText(metric)).toBe('metric deve ser: cpu, ram, sessions, sessions_by_connection ou http');
        const range = await history(superToken, 'metric=cpu&range=30d');
        expect(range.statusCode).toBe(400);
        expect(errorText(range)).toBe('range deve ser: 1h, 24h ou 7d');
    });

    it('consulta o Grafana Cloud (query_range, janela alinhada ao passo) e converte os pontos', async () => {
        fetchMock.mockResolvedValue(prom([{ metric: {}, values: [[1751900000, '42.5'], [1751900060, '43.1']] }]));
        const res = await history(superToken, 'metric=cpu&range=1h');
        expect(res.statusCode).toBe(200);
        expect(body(res)).toEqual({
            metric: 'cpu', range: '1h',
            series: [expect.objectContaining({ name: 'cpu', points: [{ t: 1751900000000, v: 42.5 }, { t: 1751900060000, v: 43.1 }] })],
        });
        const [url, options] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
        expect(url.startsWith('https://prometheus.test/api/prom/api/v1/query_range?')).toBe(true);
        const params = new URL(url).searchParams;
        expect(params.get('step')).toBe('60');
        expect(Number(params.get('end')) - Number(params.get('start'))).toBe(3600);
        expect(Number(params.get('end')) % 60).toBe(0);
        expect(options.headers.Authorization).toBe(`Basic ${Buffer.from('123456:glc_teste').toString('base64')}`);
    });

    it('a métrica http traz requisições e erros por minuto', async () => {
        fetchMock.mockResolvedValue(prom([{ metric: {}, values: [[1751900000, '10']] }]));
        const res = await history(superToken, 'metric=http&range=7d');
        expect(body(res).series.map((s: { name: string }) => s.name)).toEqual(['req_per_min', 'err_per_min']);
        expect(new URL(fetchMock.mock.calls[0][0] as string).searchParams.get('step')).toBe('3600');
    });

    it('repete a resposta por 1 minuto sem consultar de novo', async () => {
        fetchMock.mockResolvedValue(prom([{ metric: {}, values: [[1751900000, '1']] }]));
        await history(superToken, 'metric=ram&range=24h');
        await history(superToken, 'metric=ram&range=24h');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('Grafana fora do ar → 502', async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
        const res = await history(superToken, 'metric=sessions&range=7d');
        expect(res.statusCode).toBe(502);
        expect(errorText(res)).toBe('Falha ao consultar métricas');
    });

    it('sem credenciais do Grafana → 503', async () => {
        const saved = env.GRAFANA_PROM_TOKEN;
        (env as { GRAFANA_PROM_TOKEN?: string }).GRAFANA_PROM_TOKEN = undefined;
        try {
            const res = await history(superToken, 'metric=sessions&range=1h');
            expect(res.statusCode).toBe(503);
            expect(errorText(res)).toBe('Monitoramento ainda não configurado no servidor');
            expect(fetchMock).not.toHaveBeenCalled();
        } finally {
            (env as { GRAFANA_PROM_TOKEN?: string }).GRAFANA_PROM_TOKEN = saved;
        }
    });

    it('[correção] sessões por conexão: uma série por conexão, com o id e o nome', async () => {
        fetchMock.mockResolvedValue(prom([
            { metric: { connection_id: '5', connection_name: 'KAMILA' }, values: [[1751900000, '1']] },
            { metric: { connection_id: '9', connection_name: 'Loja "Centro"' }, values: [[1751900000, '0']] },
        ]));
        const res = body(await history(superToken, 'metric=sessions_by_connection&range=1h'));
        expect(res.series).toEqual([
            { name: 'sessions_by_connection{connection_id="5",connection_name="KAMILA"}', labels: { connection_id: '5', connection_name: 'KAMILA' }, points: [{ t: 1751900000000, v: 1 }] },
            { name: 'sessions_by_connection{connection_id="9",connection_name="Loja \\"Centro\\""}', labels: { connection_id: '9', connection_name: 'Loja "Centro"' }, points: [{ t: 1751900000000, v: 0 }] },
        ]);
        // várias réplicas da API publicam a mesma conexão: a consulta agrega por conexão
        expect(new URL(fetchMock.mock.calls[0][0] as string).searchParams.get('query'))
            .toBe('max by (connection_id, connection_name) (whatsapp_sessions_by_connection)');
    });

    it('[correção] pontos sem valor (NaN) são descartados', async () => {
        fetchMock.mockResolvedValue(prom([{ metric: {}, values: [[1751900000, 'NaN'], [1751900060, '5']] }]));
        const res = body(await history(superToken, 'metric=cpu&range=24h'));
        expect(res.series[0].points).toEqual([{ t: 1751900060000, v: 5 }]);
    });
});

describe('Webhook de alertas do Grafana', () => {
    const payload = {
        alerts: [{
            status: 'firing', labels: { alertname: 'RedisDown', severity: 'critical' },
            annotations: { summary: 'Redis fora do ar há 2 minutos' }, startsAt: '2026-07-07T10:00:00Z',
        }],
    };
    const alert = (authorization?: string, data: object = payload) =>
        app.inject({ method: 'POST', url: '/monitoring/alert', payload: data, headers: authorization ? { authorization } : {} });

    it('sem token ou com token errado → 401, sem enviar nada', async () => {
        const send = vi.spyOn(whatsappService, 'sendTextToPhone').mockResolvedValue(undefined);
        expect((await alert()).statusCode).toBe(401);
        expect((await alert('Bearer outro-token-qualquer')).statusCode).toBe(401);
        expect(send).not.toHaveBeenCalled();
    });

    it('com o token, responde na hora e envia o alerta pelo WhatsApp', async () => {
        const send = vi.spyOn(whatsappService, 'sendTextToPhone').mockResolvedValue(undefined);
        const res = await alert(`Bearer ${TOKEN}`);
        expect(res.statusCode).toBe(200);
        expect(body(res)).toEqual({ ok: true });
        await vi.waitFor(() => expect(send).toHaveBeenCalledWith(7, '5511999990000', expect.stringContaining('🚨 *RedisDown*')));
        expect(send.mock.calls[0][2]).toContain('Desde: 07/07/2026, 07:00');
    });

    it('falha no envio não muda a resposta', async () => {
        const send = vi.spyOn(whatsappService, 'sendTextToPhone').mockRejectedValue(new Error('sem conexão'));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        expect((await alert(`Bearer ${TOKEN}`)).statusCode).toBe(200);
        await vi.waitFor(() => expect(send).toHaveBeenCalled());
    });

    it('sem alertas no corpo, responde 200 e não envia', async () => {
        const send = vi.spyOn(whatsappService, 'sendTextToPhone').mockResolvedValue(undefined);
        expect((await alert(`Bearer ${TOKEN}`, { alerts: [] })).statusCode).toBe(200);
        expect(send).not.toHaveBeenCalled();
    });
});

describe('GET /metrics', () => {
    it('expõe as métricas no formato do Prometheus', async () => {
        const res = await app.inject({ method: 'GET', url: '/metrics' });
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toContain('text/plain');
        expect(res.body).toContain('http_requests_total');
        expect(res.body).toContain('whatsapp_sessions_connected');
    });

    it('[correção] com METRICS_TOKEN configurado, exige o token', async () => {
        process.env.METRICS_TOKEN = 'token-das-metricas-123';
        try {
            expect((await app.inject({ method: 'GET', url: '/metrics' })).statusCode).toBe(401);
            expect((await app.inject({ method: 'GET', url: '/metrics', headers: { authorization: 'Bearer errado' } })).statusCode).toBe(401);
            const ok = await app.inject({ method: 'GET', url: '/metrics', headers: { authorization: 'Bearer token-das-metricas-123' } });
            expect(ok.statusCode).toBe(200);
        } finally {
            delete process.env.METRICS_TOKEN;
        }
    });

    it('[correção] em produção sem METRICS_TOKEN, fica fechado (antes ficava aberto na internet)', async () => {
        const saved = env.NODE_ENV;
        (env as { NODE_ENV: string }).NODE_ENV = 'production';
        try {
            expect((await app.inject({ method: 'GET', url: '/metrics' })).statusCode).toBe(404);
        } finally {
            (env as { NODE_ENV: string }).NODE_ENV = saved;
        }
    });

    it('[correção] sessões por conexão refletem o banco na hora da coleta: caiu = 0', async () => {
        const [on, off] = await db.insert(connections).values([
            { company_id: companyId, name: `Mon Ligada ${SUFFIX}`, status: 'connected' },
            { company_id: companyId, name: `Mon Caiu ${SUFFIX}`, status: 'connected' },
        ]).returning({ id: connections.id });
        await app.inject({ method: 'GET', url: '/metrics' });
        await db.update(connections).set({ status: 'disconnected' }).where(eq(connections.id, off.id));

        const res = await app.inject({ method: 'GET', url: '/metrics' });
        expect(res.body).toContain(`whatsapp_sessions_by_connection{connection_id="${on.id}",connection_name="Mon Ligada ${SUFFIX}"} 1`);
        expect(res.body).toContain(`whatsapp_sessions_by_connection{connection_id="${off.id}",connection_name="Mon Caiu ${SUFFIX}"} 0`);
        const [{ total }] = await db.select({ total: sql<number>`cast(count(*) as int)` }).from(connections).where(eq(connections.status, 'connected'));
        expect(res.body).toMatch(new RegExp(`^whatsapp_sessions_connected ${total}$`, 'm'));
    });
});
