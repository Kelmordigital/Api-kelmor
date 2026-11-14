import { describe, it, expect, vi, afterEach } from 'vitest';
import { Registry } from 'prom-client';
import { formatAlertMessage, GrafanaAlertService, type AlertSettings } from '../../src/modules/monitoring/grafana-alert.service';
import { MetricsHistoryService } from '../../src/modules/monitoring/metrics-history.service';
import { GrafanaCloudPrometheus, type PrometheusClient, type PromSeries } from '../../src/modules/monitoring/prometheus.client';
import { MetricsAccess } from '../../src/modules/monitoring/metrics-access';
import { metricsRegistry, recordHttpRequest, WhatsappSessionGauges, type ConnectionSnapshot } from '../../src/modules/monitoring/monitoring.metrics';
import { secretsMatch, bearerToken } from '../../src/core/auth/secret';
import { BadGatewayError, BadRequestError, ServiceUnavailableError } from '../../src/core/errors/http-errors';

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('formatAlertMessage', () => {
    const baseAlert = {
        status: 'firing' as const,
        labels: { alertname: 'DiscoEnchendo', severity: 'warning' },
        annotations: { summary: 'Disco 87% usado (limite 85%)' },
        startsAt: '2026-07-07T14:32:00Z',
    };

    it('retorna null quando não há alertas ou o payload é malformado', () => {
        expect(formatAlertMessage(undefined)).toBeNull();
        expect(formatAlertMessage({ alerts: [] })).toBeNull();
        expect(formatAlertMessage({ alerts: 'malformado' as never })).toBeNull();
    });

    it('formata alerta warning com resumo e data no horário de Brasília', () => {
        expect(formatAlertMessage({ alerts: [baseAlert] })).toBe(
            '🔔 ALERTA — Kelmor\n\n⚠️ *DiscoEnchendo*\nDisco 87% usado (limite 85%)\nDesde: 07/07/2026, 11:32',
        );
    });

    it('usa 🚨 para critical e ✅ para resolvido; sem nome, "Alerta"', () => {
        expect(formatAlertMessage({ alerts: [{ ...baseAlert, labels: { alertname: 'PostgresDown', severity: 'critical' } }] })).toContain('🚨 *PostgresDown*');
        expect(formatAlertMessage({ alerts: [{ ...baseAlert, status: 'resolved' }] })).toContain('✅');
        expect(formatAlertMessage({ alerts: [{ status: 'firing' }] })).toBe('🔔 ALERTA — Kelmor\n\n⚠️ *Alerta*');
    });

    it('limita a 5 alertas por mensagem', () => {
        const many = Array.from({ length: 8 }, (_, i) => ({ ...baseAlert, labels: { alertname: `Alerta${i}`, severity: 'warning' } }));
        const msg = formatAlertMessage({ alerts: many })!;
        expect(msg).toContain('Alerta4');
        expect(msg).not.toContain('Alerta5');
    });
});

describe('GrafanaAlertService', () => {
    const destination = { connectionId: 7, phone: '5511999990000' };
    const payload = { alerts: [{ status: 'firing' as const, labels: { alertname: 'RedisDown' } }] };
    const make = (settings: Partial<AlertSettings> = {}, send = vi.fn(async () => undefined)) => {
        const log = vi.fn();
        const service = new GrafanaAlertService({ send }, () => ({ webhookToken: 'token-de-teste-com-16chars', destination, ...settings }), log);
        return { service, send, log };
    };

    it('só aceita o token configurado; sem token configurado, recusa todos', () => {
        const { service } = make();
        expect(service.authorize('Bearer token-de-teste-com-16chars')).toBe(true);
        expect(service.authorize('Bearer token-errado')).toBe(false);
        expect(service.authorize('token-de-teste-com-16chars')).toBe(false);
        expect(service.authorize(undefined)).toBe(false);
        expect(make({ webhookToken: undefined }).service.authorize('Bearer ')).toBe(false);
    });

    it('envia a mensagem para o destino configurado', () => {
        const { service, send } = make();
        service.notify(payload);
        expect(send).toHaveBeenCalledWith(destination, expect.stringContaining('RedisDown'));
    });

    it('sem alertas ou sem destino, não envia', () => {
        const a = make();
        a.service.notify({ alerts: [] });
        expect(a.send).not.toHaveBeenCalled();
        const b = make({ destination: null });
        b.service.notify(payload);
        expect(b.send).not.toHaveBeenCalled();
    });

    it('falha no envio só é registrada', async () => {
        const { service, log } = make({}, vi.fn(async () => { throw new Error('sem conexão'); }));
        expect(() => service.notify(payload)).not.toThrow();
        await vi.waitFor(() => expect(log).toHaveBeenCalledWith(expect.stringContaining('sem conexão')));
    });
});

describe('GrafanaCloudPrometheus', () => {
    const client = new GrafanaCloudPrometheus(() => ({ url: 'https://prom.test/api/prom/', user: '123456', token: 'glc_teste' }));

    it('consulta query_range com Basic auth e converte os pontos (t em ms; NaN descartado)', async () => {
        const fetchMock = vi.fn(async () => ({
            ok: true,
            json: async () => ({ data: { result: [{ metric: { connection_id: '5' }, values: [[1751900000, '42.5'], [1751900060, 'NaN']] }] } }),
        }));
        vi.stubGlobal('fetch', fetchMock);
        expect(await client.queryRange('up', 100, 200, 60)).toEqual([{ labels: { connection_id: '5' }, points: [{ t: 1751900000000, v: 42.5 }] }]);
        const [url, options] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
        expect(url).toBe('https://prom.test/api/prom/api/v1/query_range?query=up&start=100&end=200&step=60');
        expect(options.headers.Authorization).toBe(`Basic ${Buffer.from('123456:glc_teste').toString('base64')}`);
    });

    it('resposta não-2xx vira erro', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401 })));
        await expect(client.queryRange('up', 1, 2, 1)).rejects.toThrow('401');
    });

    it('só está configurado com url, usuário e token', () => {
        expect(client.isConfigured()).toBe(true);
        expect(new GrafanaCloudPrometheus(() => ({ url: 'https://x', user: '1' })).isConfigured()).toBe(false);
    });
});

describe('MetricsHistoryService', () => {
    const NOW = 1_751_900_123_000;
    const series = (labels: Record<string, string> = {}): PromSeries => ({ labels, points: [{ t: 1, v: 2 }] });
    const make = (queryRange: PrometheusClient['queryRange'] = vi.fn(async () => [series()]), configured = true) => {
        const prometheus = { isConfigured: () => configured, queryRange: vi.fn(queryRange) };
        let now = NOW;
        const service = new MetricsHistoryService(prometheus, 60_000, () => now, vi.fn());
        return { service, prometheus, advance: (ms: number) => { now += ms; } };
    };

    it('valida métrica e período; sem configuração, 503', async () => {
        const { service } = make();
        await expect(service.history('disco', '1h')).rejects.toBeInstanceOf(BadRequestError);
        await expect(service.history('cpu', '30d')).rejects.toBeInstanceOf(BadRequestError);
        await expect(service.history('toString', '1h')).rejects.toBeInstanceOf(BadRequestError);
        await expect(make(undefined, false).service.history('cpu', '1h')).rejects.toBeInstanceOf(ServiceUnavailableError);
    });

    it('janela alinhada ao passo do período', async () => {
        const { service, prometheus } = make();
        await service.history('cpu', '24h');
        const [, start, end, step] = prometheus.queryRange.mock.calls[0];
        expect(step).toBe(300);
        expect(end % 300).toBe(0);
        expect(end - start).toBe(86_400);
        expect(end).toBeLessThanOrEqual(NOW / 1000);
    });

    it('http traz duas séries; sem dados, série vazia', async () => {
        expect((await make().service.history('http', '1h')).series.map((s) => s.name)).toEqual(['req_per_min', 'err_per_min']);
        expect((await make(vi.fn(async () => [])).service.history('cpu', '1h')).series).toEqual([{ name: 'cpu', points: [] }]);
    });

    it('sessões por conexão: uma série por conexão; sem conexões, lista vazia', async () => {
        const res = await make(vi.fn(async () => [series({ connection_name: 'KAMILA', connection_id: '5' })])).service.history('sessions_by_connection', '1h');
        expect(res.series).toEqual([{
            name: 'sessions_by_connection{connection_id="5",connection_name="KAMILA"}',
            labels: { connection_name: 'KAMILA', connection_id: '5' }, points: [{ t: 1, v: 2 }],
        }]);
        expect((await make(vi.fn(async () => [])).service.history('sessions_by_connection', '1h')).series).toEqual([]);
    });

    it('guarda a resposta por 1 minuto', async () => {
        const { service, prometheus, advance } = make();
        await service.history('ram', '1h');
        advance(59_000);
        await service.history('ram', '1h');
        expect(prometheus.queryRange).toHaveBeenCalledTimes(1);
        advance(2_000);
        await service.history('ram', '1h');
        expect(prometheus.queryRange).toHaveBeenCalledTimes(2);
    });

    it('falha do Grafana → 502, sem guardar', async () => {
        const { service, prometheus } = make(vi.fn(async () => { throw new Error('timeout'); }));
        await expect(service.history('cpu', '7d')).rejects.toEqual(new BadGatewayError('Falha ao consultar métricas'));
        await expect(service.history('cpu', '7d')).rejects.toBeInstanceOf(BadGatewayError);
        expect(prometheus.queryRange).toHaveBeenCalledTimes(2);
    });
});

describe('Métricas HTTP', () => {
    it('registra contador e histograma; ignora /metrics, /health e /uploads', async () => {
        recordHttpRequest('GET', '/api/v1/atendimento/tickets', 200, 123);
        recordHttpRequest('GET', '/metrics', 200, 5);
        recordHttpRequest('GET', '/health', 200, 5);
        recordHttpRequest('GET', '/uploads/foto.png', 200, 5);
        const out = await metricsRegistry.metrics();
        expect(out).toContain('route="/api/v1/atendimento/tickets"');
        expect(out).toContain('http_request_duration_seconds_bucket');
        expect(out).not.toContain('route="/metrics"');
        expect(out).not.toContain('route="/health"');
        expect(out).not.toContain('route="/uploads/foto.png"');
    });
});

describe('WhatsappSessionGauges', () => {
    const make = () => {
        const registry = new Registry();
        const log = vi.fn();
        return { registry, log, gauges: new WhatsappSessionGauges(registry, log) };
    };

    it('sem fonte, publica o que foi gravado', async () => {
        const { registry, gauges } = make();
        gauges.connected.set(4);
        expect(await registry.metrics()).toMatch(/^whatsapp_sessions_connected 4$/m);
    });

    it('com fonte, cada coleta relê: conectada = 1, caída = 0, apagada some (uma leitura por coleta)', async () => {
        const { registry, gauges } = make();
        let snapshot: ConnectionSnapshot[] = [{ id: 1, name: 'A', connected: true }, { id: 2, name: 'B', connected: true }];
        const source = vi.fn(async () => snapshot);
        gauges.useSource(source);

        await registry.metrics();
        snapshot = [{ id: 1, name: 'A', connected: false }];
        const out = await registry.metrics();
        expect(out).toContain('whatsapp_sessions_by_connection{connection_id="1",connection_name="A"} 0');
        expect(out).not.toContain('connection_id="2"');
        expect(out).toMatch(/^whatsapp_sessions_connected 0$/m);
        expect(source).toHaveBeenCalledTimes(2);
    });

    it('se a leitura falhar, mantém os últimos valores e a coleta segue', async () => {
        const { registry, gauges, log } = make();
        let fail = false;
        gauges.useSource(async () => {
            if (fail) throw new Error('banco fora');
            return [{ id: 1, name: 'A', connected: true }];
        });
        await registry.metrics();
        fail = true;
        const out = await registry.metrics();
        expect(out).toMatch(/^whatsapp_sessions_connected 1$/m);
        expect(log).toHaveBeenCalledWith(expect.stringContaining('banco fora'));
    });
});

describe('MetricsAccess', () => {
    const decide = (token: string | undefined, production: boolean, header?: string) =>
        new MetricsAccess(() => ({ token, production })).decide(header);

    it('com token, exige o token (em qualquer ambiente)', () => {
        expect(decide('t-123', true, 'Bearer t-123')).toBe('allow');
        expect(decide('t-123', false, 'Bearer outro')).toBe('unauthorized');
        expect(decide('t-123', true)).toBe('unauthorized');
    });

    it('sem token: aberto fora de produção, escondido em produção', () => {
        expect(decide(undefined, false)).toBe('allow');
        expect(decide(undefined, true, 'Bearer qualquer')).toBe('hidden');
    });
});

describe('Segredos', () => {
    it('compara em tempo constante, inclusive com tamanhos diferentes', () => {
        expect(secretsMatch('abc', 'abc')).toBe(true);
        expect(secretsMatch('abd', 'abc')).toBe(false);
        expect(secretsMatch('abcd', 'abc')).toBe(false);
        expect(secretsMatch(undefined, 'abc')).toBe(false);
    });

    it('lê o token do cabeçalho Bearer', () => {
        expect(bearerToken('Bearer xyz')).toBe('xyz');
        expect(bearerToken('Basic xyz')).toBeUndefined();
        expect(bearerToken(undefined)).toBeUndefined();
    });
});
