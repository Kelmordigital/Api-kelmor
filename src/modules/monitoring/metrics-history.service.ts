import { BadGatewayError, BadRequestError, ServiceUnavailableError } from '../../core/errors/http-errors';
import type { MetricPoint, PrometheusClient, PromSeries } from './prometheus.client';

/**
 * RN-MON-03: consultas PromQL de cada métrica do painel. Cada consulta agrega
 * as várias réplicas da API e os vários servidores do cluster numa série só
 * (ou numa por conexão, em `sessions_by_connection`).
 */
export const METRICS = {
    cpu: [
        { name: 'cpu', expr: '100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)' },
    ],
    ram: [
        { name: 'ram', expr: '100 * (1 - sum(node_memory_MemAvailable_bytes) / sum(node_memory_MemTotal_bytes))' },
    ],
    sessions: [
        { name: 'sessions', expr: 'max(whatsapp_sessions_connected)' },
    ],
    sessions_by_connection: [
        { name: 'sessions_by_connection', expr: 'max by (connection_id, connection_name) (whatsapp_sessions_by_connection)', perLabel: true },
    ],
    http: [
        { name: 'req_per_min', expr: 'sum(rate(http_requests_total[5m])) * 60' },
        { name: 'err_per_min', expr: 'sum(rate(http_requests_total{status_code=~"5.."}[5m])) * 60' },
    ],
} as const;

/** Janela e passo (segundos) de cada período. */
export const RANGES = {
    '1h':  { seconds: 3_600,   step: 60 },
    '24h': { seconds: 86_400,  step: 300 },
    '7d':  { seconds: 604_800, step: 3_600 },
} as const;

export type MetricKey = keyof typeof METRICS;
export type RangeKey = keyof typeof RANGES;

export interface MetricSeries {
    /** Nome da consulta; com rótulos, `nome{rotulo="valor",...}`. */
    name: string;
    labels?: Record<string, string>;
    points: MetricPoint[];
}

export interface MetricHistory {
    metric: MetricKey;
    range: RangeKey;
    series: MetricSeries[];
}

const isMetric = (value: unknown): value is MetricKey => typeof value === 'string' && Object.hasOwn(METRICS, value);
const isRange = (value: unknown): value is RangeKey => typeof value === 'string' && Object.hasOwn(RANGES, value);

/** `nome{a="1",b="2"}` com os rótulos em ordem alfabética (aspas escapadas). */
function seriesName(base: string, labels: Record<string, string>): string {
    const keys = Object.keys(labels).sort();
    if (keys.length === 0) return base;
    return `${base}{${keys.map((k) => `${k}="${labels[k].replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}}`;
}

/** RN-MON-03 e 04: histórico das métricas do servidor para o painel do Super Admin. */
export class MetricsHistoryService {
    private readonly cache = new Map<string, { at: number; data: MetricHistory }>();

    constructor(
        private readonly prometheus: PrometheusClient,
        private readonly cacheTtlMs = 60_000,
        private readonly now: () => number = () => Date.now(),
        private readonly log: (message: string) => void = (m) => console.error(m),
    ) {}

    async history(metric: unknown, range: unknown): Promise<MetricHistory> {
        if (!isMetric(metric)) throw new BadRequestError('metric deve ser: cpu, ram, sessions, sessions_by_connection ou http');
        if (!isRange(range)) throw new BadRequestError('range deve ser: 1h, 24h ou 7d');
        if (!this.prometheus.isConfigured()) throw new ServiceUnavailableError('Monitoramento ainda não configurado no servidor');

        const key = `${metric}:${range}`;
        const hit = this.cache.get(key);
        if (hit && this.now() - hit.at < this.cacheTtlMs) return hit.data;

        const { seconds, step } = RANGES[range];
        // Janela alinhada à grade do passo: chamadas próximas no tempo têm os
        // mesmos timestamps (o front junta as séries por `t`).
        const end = Math.floor(this.now() / 1000 / step) * step;
        const start = end - seconds;

        let series: MetricSeries[];
        try {
            const results = await Promise.all(METRICS[metric].map(async (q) => ({ q, found: await this.prometheus.queryRange(q.expr, start, end, step) })));
            series = results.flatMap(({ q, found }) => this.toSeries(q.name, found, 'perLabel' in q));
        } catch (err) {
            this.log(`[monitoring] Erro ao consultar Grafana Cloud: ${(err as Error)?.message}`);
            throw new BadGatewayError('Falha ao consultar métricas');
        }

        const data: MetricHistory = { metric, range, series };
        this.cache.set(key, { at: this.now(), data });
        return data;
    }

    /**
     * Sem resultado: série vazia (o gráfico mostra "sem dados"); nas métricas
     * com uma série por rótulo, lista vazia ("nenhuma conexão").
     */
    private toSeries(name: string, found: PromSeries[], perLabel: boolean): MetricSeries[] {
        if (found.length === 0) return perLabel ? [] : [{ name, points: [] }];
        return found.map(({ labels, points }) => Object.keys(labels).length
            ? { name: seriesName(name, labels), labels, points }
            : { name, points });
    }
}
