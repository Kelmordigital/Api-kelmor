import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../../config/env', () => ({
    env: {
        ALERT_WEBHOOK_TOKEN: 'token-de-teste-com-16chars',
        ALERT_CONNECTION_ID: '7',
        ALERT_PHONE: '5511999990000',
    },
}));

vi.mock('../../whatsapp/whatsapp.service', () => ({
    whatsappService: { sendTextToPhone: vi.fn().mockResolvedValue(undefined) },
}));

import { monitoringRoutes } from '../monitoring.routes';
import { whatsappService } from '../../whatsapp/whatsapp.service';

const payload = {
    alerts: [{
        status: 'firing',
        labels: { alertname: 'RedisDown', severity: 'warning' },
        annotations: { summary: 'Redis fora do ar há 2 minutos' },
        startsAt: '2026-07-07T10:00:00Z',
    }],
};

async function buildTestApp() {
    const app = Fastify();
    await app.register(monitoringRoutes);
    return app;
}

describe('POST /monitoring/alert', () => {
    beforeEach(() => vi.clearAllMocks());

    it('rejeita sem token', async () => {
        const app = await buildTestApp();
        const res = await app.inject({ method: 'POST', url: '/monitoring/alert', payload });
        expect(res.statusCode).toBe(401);
        expect(whatsappService.sendTextToPhone).not.toHaveBeenCalled();
    });

    it('rejeita com token errado', async () => {
        const app = await buildTestApp();
        const res = await app.inject({
            method: 'POST', url: '/monitoring/alert', payload,
            headers: { authorization: 'Bearer token-errado' },
        });
        expect(res.statusCode).toBe(401);
    });

    it('aceita com token correto e dispara o WhatsApp de forma assíncrona', async () => {
        const app = await buildTestApp();
        const res = await app.inject({
            method: 'POST', url: '/monitoring/alert', payload,
            headers: { authorization: 'Bearer token-de-teste-com-16chars' },
        });
        expect(res.statusCode).toBe(200);
        await vi.waitFor(() => {
            expect(whatsappService.sendTextToPhone).toHaveBeenCalledWith(
                7,
                '5511999990000',
                expect.stringContaining('RedisDown'),
            );
        });
    });

    it('responde 200 mesmo sem alertas no corpo (sem enviar nada)', async () => {
        const app = await buildTestApp();
        const res = await app.inject({
            method: 'POST', url: '/monitoring/alert', payload: { alerts: [] },
            headers: { authorization: 'Bearer token-de-teste-com-16chars' },
        });
        expect(res.statusCode).toBe(200);
        expect(whatsappService.sendTextToPhone).not.toHaveBeenCalled();
    });
});
