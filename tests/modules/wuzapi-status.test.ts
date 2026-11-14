import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../src/database/client';
import { getRedisClient } from '../../src/config/redis';
import { companies } from '../../src/modules/companies/company.db.schema';
import { connections } from '../../src/modules/atendimento/atendimento.db.schema';
import { whatsappService } from '../../src/modules/whatsapp/whatsapp.service';
import { wuzapiModule } from '../../src/modules/whatsapp/wuzapi/wuzapi.module';
import type { WuzapiClient } from '../../src/modules/whatsapp/wuzapi/wuzapi.client';

/**
 * Bug: o card da conexão WuzAPI ficava "Aguardando..." até 24h quando o webhook
 * do QR se perdia, porque o status 'loading_qr' do Redis só mudava por webhook.
 * Agora, nesses estados de espera, o status é confirmado na própria WuzAPI.
 */
const SUFFIX = Date.now();
const DAY = 60 * 60 * 24;
let companyId: string;
let wuzId: number;
let baysId: number;

const statusKey = (id: number) => `wa:status:${id}`;
const qrKey = (id: number) => `wa:qr:${id}`;

function fakeClient(impl: Partial<Record<'status' | 'qr', () => Promise<unknown>>>) {
    const client = {
        status: vi.fn(impl.status ?? (async () => ({ connected: false, loggedIn: false }))),
        qr: vi.fn(impl.qr ?? (async () => null)),
    };
    vi.spyOn(wuzapiModule, 'client', 'get').mockReturnValue(client as unknown as WuzapiClient);
    return client;
}

describe('getStatus de conexão WuzAPI — estados de espera não travam', () => {
    const redis = getRedisClient()!;

    beforeAll(async () => {
        const [co] = await db.insert(companies).values({ name: `Empresa WuzStatus ${SUFFIX}`, status: true })
            .returning({ id: companies.id });
        companyId = co.id;
        const [w] = await db.insert(connections).values({ company_id: companyId, name: 'Wuz', type: 'wuzapi' })
            .returning({ id: connections.id });
        const [b] = await db.insert(connections).values({ company_id: companyId, name: 'Bays' })
            .returning({ id: connections.id });
        wuzId = w.id;
        baysId = b.id;
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await redis.del(statusKey(wuzId), qrKey(wuzId), statusKey(baysId));
    });

    afterAll(async () => {
        await db.delete(connections).where(eq(connections.company_id, companyId));
        await db.delete(companies).where(eq(companies.id, companyId));
    });

    it('preso em loading_qr (webhook perdido) e a WuzAPI já tem QR → mostra o QR', async () => {
        await redis.set(statusKey(wuzId), 'loading_qr', 'EX', DAY - 300);
        fakeClient({
            status: async () => ({ connected: true, loggedIn: false }),
            qr: async () => 'data:image/png;base64,QR',
        });

        expect(await whatsappService.getStatus(wuzId)).toEqual({ status: 'qr_ready', qr: 'data:image/png;base64,QR' });
        expect(await redis.get(statusKey(wuzId))).toBe('qr_ready');
    });

    it('preso em loading_qr e o QR expirou (socket fechado) → Desconectado, botão Conectar liberado', async () => {
        await redis.set(statusKey(wuzId), 'loading_qr', 'EX', DAY - 300);
        await redis.set(qrKey(wuzId), 'qr-velho');
        fakeClient({});

        expect(await whatsappService.getStatus(wuzId)).toEqual({ status: 'disconnected' });
        expect(await redis.get(statusKey(wuzId))).toBe('disconnected');
        expect(await redis.get(qrKey(wuzId))).toBeNull();
    });

    it('acabou de clicar em Conectar (socket ainda abrindo) → segue Aguardando, sem piscar Desconectado', async () => {
        await redis.set(statusKey(wuzId), 'loading_qr', 'EX', DAY);
        fakeClient({});

        expect(await whatsappService.getStatus(wuzId)).toEqual({ status: 'loading_qr' });
    });

    it('qr_ready no cache: devolve o QR atual da WuzAPI, não o guardado', async () => {
        await redis.set(statusKey(wuzId), 'qr_ready', 'EX', DAY);
        await redis.set(qrKey(wuzId), 'qr-velho');
        fakeClient({
            status: async () => ({ connected: true, loggedIn: false }),
            qr: async () => 'qr-novo',
        });

        expect(await whatsappService.getStatus(wuzId)).toEqual({ status: 'qr_ready', qr: 'qr-novo' });
    });

    it('leu o QR mas o webhook não chegou → Conectado', async () => {
        await redis.set(statusKey(wuzId), 'qr_ready', 'EX', DAY);
        fakeClient({ status: async () => ({ connected: true, loggedIn: true, jid: '5564@s.whatsapp.net' }) });

        expect(await whatsappService.getStatus(wuzId)).toEqual({ status: 'connected' });
        const [row] = await db.select({ status: connections.status, serialized_id: connections.serialized_id })
            .from(connections).where(eq(connections.id, wuzId));
        expect(row).toEqual({ status: 'connected', serialized_id: '5564@s.whatsapp.net' });
        await db.update(connections).set({ status: 'disconnected', serialized_id: null }).where(eq(connections.id, wuzId));
    });

    it('WuzAPI fora do ar → mantém o estado de espera (não inventa Desconectado)', async () => {
        await redis.set(statusKey(wuzId), 'loading_qr', 'EX', DAY - 300);
        fakeClient({ status: async () => { throw new Error('ECONNREFUSED'); } });

        expect(await whatsappService.getStatus(wuzId)).toEqual({ status: 'loading_qr' });
    });

    it('conexão do bays em loading_qr não consulta a WuzAPI (comportamento antigo)', async () => {
        await redis.set(statusKey(baysId), 'loading_qr', 'EX', DAY - 300);
        const client = fakeClient({});

        expect(await whatsappService.getStatus(baysId)).toEqual({ status: 'loading_qr' });
        expect(client.status).not.toHaveBeenCalled();
    });
});
