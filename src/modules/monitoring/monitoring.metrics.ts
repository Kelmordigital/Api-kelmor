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

export const whatsappSessionsConnected = new Gauge({
    name: 'whatsapp_sessions_connected',
    help: 'Quantidade de sessões WhatsApp com status connected',
    registers: [metricsRegistry],
});

const IGNORED_ROUTES = new Set(['/metrics', '/health']);

export function recordHttpRequest(method: string, route: string, statusCode: number, durationMs: number) {
    if (IGNORED_ROUTES.has(route) || route.startsWith('/uploads')) return;
    httpRequestsTotal.inc({ method, route, status_code: String(statusCode) });
    httpRequestDuration.observe({ method, route }, durationMs / 1000);
}
