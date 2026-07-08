import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/env', () => ({
    env: {
        GRAFANA_PROM_URL: 'https://prometheus-prod-01.grafana.net/api/prom',
        GRAFANA_PROM_USER: '123456',
        GRAFANA_PROM_TOKEN: 'glc_token_de_teste',
    },
}));

import { fetchMetricHistory, _clearCacheForTests } from '../grafana-prom.client';

const promResponse = {
    ok: true,
    json: async () => ({
        data: { result: [{ values: [[1751900000, '42.5'], [1751900060, '43.1']] }] },
    }),
};

describe('fetchMetricHistory', () => {
    beforeEach(() => {
        _clearCacheForTests();
        vi.restoreAllMocks();
    });

    it('consulta query_range e converte pontos (t em ms, v numérico)', async () => {
        const fetchMock = vi.fn().mockResolvedValue(promResponse);
        vi.stubGlobal('fetch', fetchMock);

        const data = await fetchMetricHistory('cpu', '1h');

        expect(data.metric).toBe('cpu');
        expect(data.series[0].name).toBe('cpu');
        expect(data.series[0].points[0]).toEqual({ t: 1751900000000, v: 42.5 });
        const calledUrl = String(fetchMock.mock.calls[0][0]);
        expect(calledUrl).toContain('/api/v1/query_range');
        expect(calledUrl).toContain('step=60');

        const params = new URL(calledUrl).searchParams;
        expect(Number(params.get('start')) % 60).toBe(0);
        expect(Number(params.get('end')) % 60).toBe(0);

        const calledOpts = fetchMock.mock.calls[0][1] as { headers: Record<string, string> };
        expect(calledOpts.headers.Authorization).toBe(
            `Basic ${Buffer.from('123456:glc_token_de_teste').toString('base64')}`,
        );
    });

    it('usa cache na segunda chamada dentro do TTL', async () => {
        const fetchMock = vi.fn().mockResolvedValue(promResponse);
        vi.stubGlobal('fetch', fetchMock);

        await fetchMetricHistory('ram', '24h');
        await fetchMetricHistory('ram', '24h');

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('métrica http retorna duas séries (req_per_min e err_per_min)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(promResponse));
        const data = await fetchMetricHistory('http', '1h');
        expect(data.series.map((s) => s.name)).toEqual(['req_per_min', 'err_per_min']);
    });

    it('propaga erro quando o Grafana responde não-2xx', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
        await expect(fetchMetricHistory('cpu', '7d')).rejects.toThrow('401');
    });
});
