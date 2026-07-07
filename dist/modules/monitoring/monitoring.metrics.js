"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.whatsappSessionsConnected = exports.httpRequestDuration = exports.httpRequestsTotal = exports.metricsRegistry = void 0;
exports.recordHttpRequest = recordHttpRequest;
const prom_client_1 = require("prom-client");
exports.metricsRegistry = new prom_client_1.Registry();
// CPU/heap/event-loop do processo Node (prefixo padrão nodejs_/process_)
(0, prom_client_1.collectDefaultMetrics)({ register: exports.metricsRegistry });
exports.httpRequestsTotal = new prom_client_1.Counter({
    name: 'http_requests_total',
    help: 'Total de requisições HTTP por método, rota e status',
    labelNames: ['method', 'route', 'status_code'],
    registers: [exports.metricsRegistry],
});
exports.httpRequestDuration = new prom_client_1.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duração das requisições HTTP em segundos',
    labelNames: ['method', 'route'],
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    registers: [exports.metricsRegistry],
});
exports.whatsappSessionsConnected = new prom_client_1.Gauge({
    name: 'whatsapp_sessions_connected',
    help: 'Quantidade de sessões WhatsApp com status connected',
    registers: [exports.metricsRegistry],
});
const IGNORED_ROUTES = new Set(['/metrics', '/health']);
function recordHttpRequest(method, route, statusCode, durationMs) {
    if (IGNORED_ROUTES.has(route) || route.startsWith('/uploads'))
        return;
    exports.httpRequestsTotal.inc({ method, route, status_code: String(statusCode) });
    exports.httpRequestDuration.observe({ method, route }, durationMs / 1000);
}
//# sourceMappingURL=monitoring.metrics.js.map