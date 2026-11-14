import { Registry, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';

export const metricsRegistry = new Registry();

// CPU/heap/event-loop do processo Node (prefixo padrão nodejs_/process_)
collectDefaultMetrics({ register: metricsRegistry });

export const httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total de requisições HTTP por método, rota e status',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [metricsRegistry],
});

export const httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duração das requisições HTTP em segundos',
    labelNames: ['method', 'route'] as const,
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    registers: [metricsRegistry],
});

/** Estado de uma conexão de WhatsApp no momento da coleta. */
export interface ConnectionSnapshot {
    id: number;
    name: string;
    connected: boolean;
}

export type ConnectionSnapshotSource = () => Promise<ConnectionSnapshot[]>;

/**
 * RN-MON-05: sessões de WhatsApp. A cada coleta do /metrics, os valores são
 * lidos da fonte (o banco): 1 para conexão conectada, 0 para as demais; uma
 * conexão apagada some. Sem fonte (testes unitários), valem os valores
 * gravados com `set`.
 */
export class WhatsappSessionGauges {
    readonly connected: Gauge;
    readonly byConnection: Gauge<'connection_id' | 'connection_name'>;
    private source?: ConnectionSnapshotSource;
    private refreshing?: Promise<void>;

    constructor(registry: Registry, private readonly log: (message: string) => void = (m) => console.error(m)) {
        this.connected = new Gauge({
            name: 'whatsapp_sessions_connected',
            help: 'Quantidade de sessões WhatsApp com status connected',
            registers: [registry],
            collect: () => this.refresh(),
        });
        this.byConnection = new Gauge({
            name: 'whatsapp_sessions_by_connection',
            help: 'Sessão WhatsApp por conexão (1 = conectada, 0 = não)',
            labelNames: ['connection_id', 'connection_name'] as const,
            registers: [registry],
            collect: () => this.refresh(),
        });
    }

    useSource(source: ConnectionSnapshotSource): void {
        this.source = source;
    }

    /** As duas métricas são coletadas juntas: uma única leitura serve às duas. */
    private refresh(): Promise<void> {
        if (!this.source) return Promise.resolve();
        this.refreshing ??= this.load(this.source).finally(() => { this.refreshing = undefined; });
        return this.refreshing;
    }

    private async load(source: ConnectionSnapshotSource): Promise<void> {
        try {
            const snapshot = await source();
            this.byConnection.reset();
            for (const c of snapshot) {
                this.byConnection.set({ connection_id: String(c.id), connection_name: c.name }, c.connected ? 1 : 0);
            }
            this.connected.set(snapshot.filter((c) => c.connected).length);
        } catch (err) {
            // Mantém os últimos valores: a coleta não pode falhar por causa disso.
            this.log(`[monitoring] Falha ao ler as conexões para as métricas: ${(err as Error)?.message}`);
        }
    }
}

export const whatsappSessionGauges = new WhatsappSessionGauges(metricsRegistry);
export const whatsappSessionsConnected = whatsappSessionGauges.connected;
export const whatsappSessionsByConnection = whatsappSessionGauges.byConnection;

const IGNORED_ROUTES = new Set(['/metrics', '/health']);

export function recordHttpRequest(method: string, route: string, statusCode: number, durationMs: number) {
    if (IGNORED_ROUTES.has(route) || route.startsWith('/uploads')) return;
    httpRequestsTotal.inc({ method, route, status_code: String(statusCode) });
    httpRequestDuration.observe({ method, route }, durationMs / 1000);
}
