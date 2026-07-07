"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RANGES = exports.METRICS = void 0;
exports._clearCacheForTests = _clearCacheForTests;
exports.fetchMetricHistory = fetchMetricHistory;
const env_1 = require("../../config/env");
/** Consultas PromQL por métrica exposta ao painel Super Admin. */
exports.METRICS = {
    cpu: [
        { name: 'cpu', expr: '100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)' },
    ],
    ram: [
        { name: 'ram', expr: '100 * (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)' },
    ],
    sessions: [
        { name: 'sessions', expr: 'whatsapp_sessions_connected' },
    ],
    http: [
        { name: 'req_per_min', expr: 'sum(rate(http_requests_total[5m])) * 60' },
        { name: 'err_per_min', expr: 'sum(rate(http_requests_total{status_code=~"5.."}[5m])) * 60' },
    ],
};
exports.RANGES = {
    '1h': { seconds: 3_600, step: 60 },
    '24h': { seconds: 86_400, step: 300 },
    '7d': { seconds: 604_800, step: 3_600 },
};
const cache = new Map();
const CACHE_TTL_MS = 60_000;
function _clearCacheForTests() {
    cache.clear();
}
async function queryRange(expr, start, end, step) {
    const params = new URLSearchParams({
        query: expr, start: String(start), end: String(end), step: String(step),
    });
    const auth = Buffer.from(`${env_1.env.GRAFANA_PROM_USER}:${env_1.env.GRAFANA_PROM_TOKEN}`).toString('base64');
    const res = await fetch(`${env_1.env.GRAFANA_PROM_URL}/api/v1/query_range?${params}`, {
        headers: { Authorization: `Basic ${auth}` },
        signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok)
        throw new Error(`Grafana Cloud respondeu ${res.status}`);
    const body = await res.json();
    const values = body?.data?.result?.[0]?.values ?? [];
    return values.map(([t, v]) => ({ t: t * 1000, v: Number(v) }));
}
async function fetchMetricHistory(metric, range) {
    const key = `${metric}:${range}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS)
        return hit.data;
    const { seconds, step } = exports.RANGES[range];
    const end = Math.floor(Date.now() / 1000);
    const start = end - seconds;
    const series = await Promise.all(exports.METRICS[metric].map(async (q) => ({
        name: q.name,
        points: await queryRange(q.expr, start, end, step),
    })));
    const data = { metric, range, series };
    cache.set(key, { at: Date.now(), data });
    return data;
}
//# sourceMappingURL=grafana-prom.client.js.map