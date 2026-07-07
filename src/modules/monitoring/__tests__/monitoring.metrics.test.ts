import { describe, it, expect } from 'vitest';
import {
    metricsRegistry,
    recordHttpRequest,
    whatsappSessionsConnected,
} from '../monitoring.metrics';

describe('monitoring.metrics', () => {
    it('registra contador e histograma para uma requisição normal', async () => {
        recordHttpRequest('GET', '/api/v1/atendimento/tickets', 200, 123);
        const out = await metricsRegistry.metrics();
        expect(out).toContain('http_requests_total');
        expect(out).toContain('route="/api/v1/atendimento/tickets"');
        expect(out).toContain('http_request_duration_seconds_bucket');
    });

    it('ignora rotas de infraestrutura (/metrics, /health, /uploads)', async () => {
        recordHttpRequest('GET', '/metrics', 200, 5);
        recordHttpRequest('GET', '/health', 200, 5);
        recordHttpRequest('GET', '/uploads/foto.png', 200, 5);
        const out = await metricsRegistry.metrics();
        expect(out).not.toContain('route="/metrics"');
        expect(out).not.toContain('route="/health"');
        expect(out).not.toContain('route="/uploads/foto.png"');
    });

    it('expõe o gauge de sessões WhatsApp', async () => {
        whatsappSessionsConnected.set(4);
        const out = await metricsRegistry.metrics();
        expect(out).toMatch(/whatsapp_sessions_connected 4/);
    });
});
