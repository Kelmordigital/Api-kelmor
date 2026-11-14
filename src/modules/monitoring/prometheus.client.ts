export type MetricPoint = { t: number; v: number };

/** Uma série devolvida pelo Prometheus: os rótulos que a identificam e os pontos. */
export interface PromSeries {
    labels: Record<string, string>;
    points: MetricPoint[];
}

export interface PrometheusCredentials {
    url?: string;
    user?: string;
    token?: string;
}

/** Consultas de intervalo (PromQL `query_range`). */
export interface PrometheusClient {
    isConfigured(): boolean;
    queryRange(expr: string, start: number, end: number, step: number): Promise<PromSeries[]>;
}

interface QueryRangeBody {
    data?: { result?: { metric?: Record<string, string>; values?: [number, string][] }[] };
}

/**
 * Prometheus do Grafana Cloud (autenticação Basic). As credenciais são lidas a
 * cada consulta, então trocar a configuração não exige recriar o cliente.
 */
export class GrafanaCloudPrometheus implements PrometheusClient {
    constructor(
        private readonly credentials: () => PrometheusCredentials,
        private readonly timeoutMs = 15_000,
    ) {}

    isConfigured(): boolean {
        const { url, user, token } = this.credentials();
        return Boolean(url && user && token);
    }

    async queryRange(expr: string, start: number, end: number, step: number): Promise<PromSeries[]> {
        const { url, user, token } = this.credentials();
        const params = new URLSearchParams({ query: expr, start: String(start), end: String(end), step: String(step) });
        const res = await fetch(`${(url ?? '').replace(/\/+$/, '')}/api/v1/query_range?${params}`, {
            headers: { Authorization: `Basic ${Buffer.from(`${user}:${token}`).toString('base64')}` },
            signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!res.ok) throw new Error(`Grafana Cloud respondeu ${res.status}`);
        const body = await res.json() as QueryRangeBody;
        return (body.data?.result ?? []).map((series) => ({
            labels: series.metric ?? {},
            // Pontos sem valor (NaN/Inf, ex.: divisão por zero) viram buracos no gráfico.
            points: (series.values ?? [])
                .map(([t, v]) => ({ t: t * 1000, v: Number(v) }))
                .filter((p) => Number.isFinite(p.v)),
        }));
    }
}
