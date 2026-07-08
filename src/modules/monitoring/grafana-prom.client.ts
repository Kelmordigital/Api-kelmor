import { env } from '../../config/env';

/** Consultas PromQL por métrica exposta ao painel Super Admin. */
export const METRICS = {
    cpu: [
        { name: 'cpu', expr: '100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)' },
    ],
    ram: [
        { name: 'ram', expr: '100 * (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)' },
    ],
    sessions: [
        { name: 'sessions', expr: 'whatsapp_sessions_connected' },
    ],
    sessions_by_connection: [
        { name: 'sessions_by_connection', expr: 'whatsapp_sessions_by_connection' },
    ],
    http: [
        { name: 'req_per_min', expr: 'sum(rate(http_requests_total[5m])) * 60' },
        { name: 'err_per_min', expr: 'sum(rate(http_requests_total{status_code=~"5.."}[5m])) * 60' },
    ],
} as const;

export const RANGES = {
    '1h':  { seconds: 3_600,   step: 60 },
    '24h': { seconds: 86_400,  step: 300 },
    '7d':  { seconds: 604_800, step: 3_600 },
} as const;

export type MetricKey = keyof typeof METRICS;
export type RangeKey = keyof typeof RANGES;

export type MetricPoint = { t: number; v: number };
export type MetricSeries = { name: string; points: MetricPoint[] };
export type MetricHistory = { metric: MetricKey; range: RangeKey; series: MetricSeries[] };

const cache = new Map<string, { at: number; data: MetricHistory }>();
const CACHE_TTL_MS = 60_000;

export function _clearCacheForTests() {
    cache.clear();
}

async function queryRange(expr: string, start: number, end: number, step: number): Promise<MetricPoint[]> {
    const params = new URLSearchParams({
        query: expr, start: String(start), end: String(end), step: String(step),
    });
    const auth = Buffer.from(`${env.GRAFANA_PROM_USER}:${env.GRAFANA_PROM_TOKEN}`).toString('base64');
    const baseUrl = (env.GRAFANA_PROM_URL ?? '').replace(/\/+$/, '');
    const res = await fetch(`${baseUrl}/api/v1/query_range?${params}`, {
        headers: { Authorization: `Basic ${auth}` },
        signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Grafana Cloud respondeu ${res.status}`);
    const body = await res.json() as any;
    const values: [number, string][] = body?.data?.result?.[0]?.values ?? [];
    return values.map(([t, v]) => ({ t: t * 1000, v: Number(v) }));
}

export async function fetchMetricHistory(metric: MetricKey, range: RangeKey): Promise<MetricHistory> {
    const key = `${metric}:${range}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

    const { seconds, step } = RANGES[range];
    // Alinha a janela à grade do step: chamadas próximas no tempo compartilham
    // exatamente os mesmos timestamps (frontend faz merge por t)
    const end = Math.floor(Date.now() / 1000 / step) * step;
    const start = end - seconds;

    const series: MetricSeries[] = await Promise.all(
        METRICS[metric].map(async (q) => ({
            name: q.name,
            points: await queryRange(q.expr, start, end, step),
        })),
    );

    const data: MetricHistory = { metric, range, series };
    cache.set(key, { at: Date.now(), data });
    return data;
}
