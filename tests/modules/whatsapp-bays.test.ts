import { describe, it, expect, afterEach, vi } from 'vitest';
import { whatsappService } from '../../src/modules/whatsapp/whatsapp.service';

/**
 * connectionId aleatório e inexistente: o lookup em `connections` não acha
 * linha nenhuma (não lança erro), então sendTextToPhone segue o fluxo padrão
 * do bays — exatamente o caminho que queremos exercitar aqui.
 */
const FAKE_CONNECTION_ID = 999999;

describe('whatsappService.sendTextToPhone — resiliência do bays', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
        global.fetch = originalFetch;
        vi.restoreAllMocks();
    });

    it('tenta de novo uma vez quando bays responde 5xx, e tem sucesso na 2a tentativa', async () => {
        let calls = 0;
        global.fetch = vi.fn(async () => {
            calls++;
            if (calls === 1) {
                return new Response(JSON.stringify({ message: 'Connection Closed' }), { status: 500 });
            }
            return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }) as unknown as typeof fetch;

        await whatsappService.sendTextToPhone(FAKE_CONNECTION_ID, '5511999999999', 'oi');
        expect(calls).toBe(2);
    });

    it('nao tenta de novo em erro 4xx e propaga o erro com o detalhe retornado pelo bays', async () => {
        global.fetch = vi.fn(async () =>
            new Response(JSON.stringify({ message: 'Invalid phone number' }), { status: 400 }),
        ) as unknown as typeof fetch;

        await expect(
            whatsappService.sendTextToPhone(FAKE_CONNECTION_ID, '5511999999999', 'oi'),
        ).rejects.toThrow(/Invalid phone number/);
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('desiste apos a 2a tentativa se o 5xx persistir, propagando o erro com detalhe', async () => {
        global.fetch = vi.fn(async () =>
            new Response(JSON.stringify({ message: 'Connection Closed' }), { status: 500 }),
        ) as unknown as typeof fetch;

        await expect(
            whatsappService.sendTextToPhone(FAKE_CONNECTION_ID, '5511999999999', 'oi'),
        ).rejects.toThrow(/Connection Closed/);
        expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('nao fica pendurado pra sempre quando o fetch falha sem responder (ex.: timeout/rede) — reincide e desiste com erro claro', async () => {
        global.fetch = vi.fn(async () => {
            throw new DOMException('This operation was aborted', 'AbortError');
        }) as unknown as typeof fetch;

        await expect(
            whatsappService.sendTextToPhone(FAKE_CONNECTION_ID, '5511999999999', 'oi'),
        ).rejects.toThrow(/sem resposta/i);
        expect(global.fetch).toHaveBeenCalledTimes(2);
    });
});
