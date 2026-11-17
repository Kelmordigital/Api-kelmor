import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'crypto';
import { WuzapiCredentials } from '../../src/modules/whatsapp/wuzapi/wuzapi-credentials';
import { fixWuzapiMediaUrl, translateConnectionEvent, translateMessage } from '../../src/modules/whatsapp/wuzapi/wuzapi-event-translator';
import { WuzapiClient, WuzapiError, WUZAPI_SUBSCRIBED_EVENTS } from '../../src/modules/whatsapp/wuzapi/wuzapi.client';

const SECRET = 'x'.repeat(40);

function messageWebhook(info: Record<string, unknown>, message: Record<string, unknown>, extra: Record<string, unknown> = {}) {
    return { type: 'Message', event: { Info: { ID: 'MSG1', ...info }, Message: message }, userID: '1', instanceName: 'conn-5', ...extra };
}

describe('WuzapiCredentials', () => {
    const creds = new WuzapiCredentials(SECRET);

    it('deriva token e chave HMAC estáveis e diferentes por conexão', () => {
        expect(creds.token(5)).toBe(new WuzapiCredentials(SECRET).token(5));
        expect(creds.token(5)).not.toBe(creds.token(6));
        expect(creds.token(5)).toHaveLength(40);
        expect(creds.hmacKey(5).length).toBeGreaterThanOrEqual(32);
        expect(creds.hmacKey(5)).not.toBe(creds.token(5));
        expect(creds.userName(5)).toBe('conn-5');
    });

    it('aceita só a assinatura HMAC-SHA256 correta do corpo cru', () => {
        const body = '{"type":"Message"}';
        const sig = createHmac('sha256', creds.hmacKey(5)).update(body).digest('hex');
        expect(creds.isValidSignature(5, body, sig)).toBe(true);
        expect(creds.isValidSignature(5, body, sig.toUpperCase())).toBe(true);
        expect(creds.isValidSignature(6, body, sig)).toBe(false);            // chave de outra conexão
        expect(creds.isValidSignature(5, body + ' ', sig)).toBe(false);      // corpo alterado
        expect(creds.isValidSignature(5, body, undefined)).toBe(false);
        expect(creds.isValidSignature(5, body, 'abc')).toBe(false);
    });

    it('recusa segredo curto', () => {
        expect(() => new WuzapiCredentials('curto')).toThrow(/WUZAPI_SECRET/);
    });
});

describe('translateMessage', () => {
    it('texto recebido vira o formato do bays (key + pushName + message)', () => {
        const out = translateMessage(messageWebhook(
            { Chat: '5564999990000@s.whatsapp.net', Sender: '5564999990000@s.whatsapp.net', IsFromMe: false, PushName: ' Maria ' },
            { conversation: 'Oi' },
        ));
        expect(out).toEqual({
            key: { remoteJid: '5564999990000@s.whatsapp.net', fromMe: false, id: 'MSG1' },
            pushName: 'Maria',
            message: { conversation: 'Oi' },
        });
    });

    it('contato por LID leva o número revelado em sender_pn (recebida → SenderAlt)', () => {
        const out = translateMessage(messageWebhook(
            { Chat: '123456789@lid', IsFromMe: false, SenderAlt: '5564999990000@s.whatsapp.net' },
            { conversation: 'Oi' },
        ));
        expect(out?.key).toEqual({ remoteJid: '123456789@lid', fromMe: false, id: 'MSG1', sender_pn: '5564999990000@s.whatsapp.net' });
    });

    it('mensagem minha por LID usa RecipientAlt; sem número revelado fica só o LID', () => {
        const mine = translateMessage(messageWebhook(
            { Chat: '123@lid', IsFromMe: true, RecipientAlt: '5564911112222@s.whatsapp.net', SenderAlt: 'eu@s.whatsapp.net' },
            { conversation: 'Enviei pelo celular' },
        ));
        expect(mine?.key.sender_pn).toBe('5564911112222@s.whatsapp.net');
        expect(mine?.key.fromMe).toBe(true);

        const lidOnly = translateMessage(messageWebhook({ Chat: '123@lid', IsFromMe: false }, { conversation: 'Oi' }));
        expect(lidOnly?.key.sender_pn).toBeUndefined();
    });

    it('mídia gravada pela WuzAPI no bucket vira media.url (áudio leva a duração)', () => {
        const out = translateMessage(messageWebhook(
            { Chat: '5564999990000@s.whatsapp.net', IsFromMe: false },
            { audioMessage: { seconds: 12, mimetype: 'audio/ogg; codecs=opus' } },
            { s3: { url: 'https://pub.r2.dev/users/1/inbox/a.ogg', mimeType: 'audio/ogg' } },
        ));
        expect(out?.media).toEqual({ url: 'https://pub.r2.dev/users/1/inbox/a.ogg', mimetype: 'audio/ogg', seconds: 12 });
        expect(out?.message).toEqual({ audioMessage: { seconds: 12, mimetype: 'audio/ogg; codecs=opus' } });
    });

    it('ignora status, canais, broadcast e mensagens de controle (reação, protocolo, voto)', () => {
        const chat = { Chat: '5564999990000@s.whatsapp.net', IsFromMe: false };
        expect(translateMessage(messageWebhook({ Chat: 'status@broadcast' }, { conversation: 'x' }))).toBeNull();
        expect(translateMessage(messageWebhook({ Chat: '1203@newsletter' }, { conversation: 'x' }))).toBeNull();
        expect(translateMessage(messageWebhook(chat, { reactionMessage: { text: '👍' } }))).toBeNull();
        expect(translateMessage(messageWebhook(chat, { protocolMessage: { type: 0 }, messageContextInfo: {} }))).toBeNull();
        expect(translateMessage(messageWebhook(chat, { pollUpdateMessage: {} }))).toBeNull();
        expect(translateMessage(messageWebhook(chat, {}))).toBeNull();
    });

    it('não é Message, ou sem Chat/ID → null', () => {
        expect(translateMessage({ type: 'Connected', event: {} })).toBeNull();
        expect(translateMessage({ type: 'Message', event: { Info: { Chat: 'a@s.whatsapp.net' }, Message: { conversation: 'x' } } })).toBeNull();
        expect(translateMessage({ type: 'Message' })).toBeNull();
    });

    it('grupo passa adiante (o handler atual descarta @g.us, igual ao bays)', () => {
        const out = translateMessage(messageWebhook({ Chat: '1203@g.us', IsFromMe: false }, { conversation: 'x' }));
        expect(out?.key.remoteJid).toBe('1203@g.us');
    });
});

describe('translateConnectionEvent', () => {
    it('QR → qrcode com a imagem', () => {
        expect(translateConnectionEvent({ type: 'QR', event: 'code', qrCodeBase64: 'data:image/png;base64,AAA' }))
            .toEqual({ type: 'qrcode', qrCode: 'data:image/png;base64,AAA' });
        expect(translateConnectionEvent({ type: 'QR', event: 'code' })).toBeNull();
    });

    it('PairSuccess/Connected → connected (PairSuccess traz o número)', () => {
        expect(translateConnectionEvent({ type: 'PairSuccess', event: { ID: '5564999990000:12@s.whatsapp.net' } }))
            .toEqual({ type: 'connected', serializedId: '5564999990000:12@s.whatsapp.net' });
        expect(translateConnectionEvent({ type: 'Connected', event: {} })).toEqual({ type: 'connected' });
    });

    it('logout, ban, falha de conexão e QR expirado → disconnected com código', () => {
        expect(translateConnectionEvent({ type: 'LoggedOut', event: { Reason: 401 } })).toMatchObject({ type: 'disconnected', code: 401 });
        expect(translateConnectionEvent({ type: 'TemporaryBan', event: {} })).toMatchObject({ type: 'disconnected', code: 403 });
        expect(translateConnectionEvent({ type: 'ConnectFailure', event: { Reason: 405 } })).toMatchObject({ type: 'disconnected', code: 405 });
        expect(translateConnectionEvent({ type: 'QRTimeout', event: 'timeout' })).toMatchObject({ type: 'disconnected' });
    });

    it('oscilação de rede (Disconnected/KeepAliveTimeout) não derruba: o whatsmeow reconecta sozinho', () => {
        expect(translateConnectionEvent({ type: 'Disconnected', event: {} })).toBeNull();
        expect(translateConnectionEvent({ type: 'KeepAliveTimeout', event: {} })).toBeNull();
        expect(translateConnectionEvent({ type: 'Message', event: {} })).toBeNull();
    });
});

describe('WuzapiClient', () => {
    const creds = new WuzapiCredentials(SECRET);
    const config = {
        baseUrl: 'http://wuzapi:8080/',
        adminToken: 'ADMIN',
        webhookBaseUrl: 'http://api-04.dev.svc.cluster.local/',
        s3: { endpoint: 'https://r2', bucket: 'midias', accessKey: 'k', secretKey: 's', publicUrl: 'https://pub' },
    };

    function fakeFetch(responses: Array<{ status?: number; body: unknown }>) {
        const calls: Array<{ url: string; init: RequestInit }> = [];
        const http = vi.fn(async (url: string, init: RequestInit) => {
            calls.push({ url, init });
            const next = responses.shift() ?? { body: { code: 200, data: {}, success: true } };
            return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
        });
        return { http: http as unknown as typeof fetch, calls };
    }

    it('ensureUser cria o usuário com webhook, eventos, HMAC e R2 quando não existe', async () => {
        const { http, calls } = fakeFetch([
            { body: { code: 200, data: [{ name: 'conn-1' }], success: true } },
            { body: { code: 201, data: { id: 'abc' }, success: true } },
        ]);
        await new WuzapiClient(config, creds, http).ensureUser(5);

        expect(calls[0].url).toBe('http://wuzapi:8080/admin/users');
        expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('ADMIN');
        const body = JSON.parse(String(calls[1].init.body));
        expect(body).toMatchObject({
            name: 'conn-5',
            token: creds.token(5),
            webhook: 'http://api-04.dev.svc.cluster.local/wuzapi/webhook/5',
            events: WUZAPI_SUBSCRIBED_EVENTS.join(','),
            hmacKey: creds.hmacKey(5),
            s3Config: { enabled: true, bucket: 'midias', publicURL: 'https://pub', mediaDelivery: 's3' },
        });
    });

    it('ensureUser não recria quem já existe', async () => {
        const { http, calls } = fakeFetch([{ body: { code: 200, data: [{ name: 'conn-5' }], success: true } }]);
        await new WuzapiClient(config, creds, http).ensureUser(5);
        expect(calls).toHaveLength(1);
    });

    it('rotas de sessão usam o Token da conexão e devolvem o data', async () => {
        const { http, calls } = fakeFetch([
            { body: { code: 200, data: { connected: true, loggedIn: true, jid: '5564@s.whatsapp.net' }, success: true } },
        ]);
        const st = await new WuzapiClient(config, creds, http).status(5);
        expect(st).toEqual({ connected: true, loggedIn: true, jid: '5564@s.whatsapp.net' });
        expect((calls[0].init.headers as Record<string, string>).Token).toBe(creds.token(5));
    });

    it('connect regrava a chave HMAC (bug de cache da WuzAPI 1.1.0) antes de conectar', async () => {
        const { http, calls } = fakeFetch([
            { body: { Details: 'HMAC configuration saved successfully' } },
            { body: { code: 200, data: { details: 'Connected!' }, success: true } },
        ]);
        await new WuzapiClient(config, creds, http).connect(5);
        expect(calls.map((c) => c.url)).toEqual(['http://wuzapi:8080/session/hmac/config', 'http://wuzapi:8080/session/connect']);
        expect(JSON.parse(String(calls[0].init.body))).toEqual({ hmac_key: creds.hmacKey(5) });
        expect((calls[0].init.headers as Record<string, string>).Token).toBe(creds.token(5));
    });

    it('connect ignora "already connected" e propaga os outros erros', async () => {
        const hmacOk = { body: { Details: 'ok' } };
        const ok = fakeFetch([hmacOk, { status: 409, body: { code: 409, error: 'already connected', success: false } }]);
        await expect(new WuzapiClient(config, creds, ok.http).connect(5)).resolves.toBeUndefined();
        expect(JSON.parse(String(ok.calls[1].init.body))).toEqual({ Subscribe: [...WUZAPI_SUBSCRIBED_EVENTS], Immediate: true });

        const bad = fakeFetch([hmacOk, { status: 500, body: { code: 500, error: 'no session', success: false } }]);
        await expect(new WuzapiClient(config, creds, bad.http).connect(5)).rejects.toThrow(WuzapiError);
    });

    it('envia texto, mídia por URL (documento com nome) e enquete', async () => {
        const { http, calls } = fakeFetch([
            { body: { code: 200, data: { Id: 'ABC', Details: 'Sent' }, success: true } },
            { body: { code: 200, data: {}, success: true } },
            { body: { code: 200, data: {}, success: true } },
        ]);
        const client = new WuzapiClient(config, creds, http);
        expect(await client.sendText(5, '123@lid', 'Oi')).toBe('ABC');
        await client.sendMedia(5, '5564', 'document', 'https://pub/a.pdf', { caption: 'Segue', fileName: 'a.pdf', mimeType: 'application/pdf' });
        await client.sendPoll(5, '5564@s.whatsapp.net', 'Gostou?', ['Sim', 'Não']);

        expect(calls.map((c) => c.url)).toEqual([
            'http://wuzapi:8080/chat/send/text',
            'http://wuzapi:8080/chat/send/document',
            'http://wuzapi:8080/chat/send/poll',
        ]);
        expect(JSON.parse(String(calls[0].init.body))).toEqual({ Phone: '123@lid', Body: 'Oi' });
        expect(JSON.parse(String(calls[1].init.body))).toEqual({
            Phone: '5564', Document: 'https://pub/a.pdf', Caption: 'Segue', FileName: 'a.pdf', MimeType: 'application/pdf',
        });
        expect(JSON.parse(String(calls[2].init.body))).toEqual({ group: '5564@s.whatsapp.net', header: 'Gostou?', options: ['Sim', 'Não'], selectableCount: 1 });
    });

    it('código de pareamento e avatar', async () => {
        const { http } = fakeFetch([
            { body: { code: 200, data: { LinkingCode: 'ABCD-EFGH' }, success: true } },
            { body: { code: 200, data: { url: 'https://pps.whatsapp.net/x.jpg', id: '1' }, success: true } },
        ]);
        const client = new WuzapiClient(config, creds, http);
        expect(await client.pairPhone(5, '+55 (64) 99999-0000')).toBe('ABCD-EFGH');
        expect(await client.avatarUrl(5, '5564999990000')).toBe('https://pps.whatsapp.net/x.jpg');
    });

    it('falha de rede vira WuzapiError com o caminho', async () => {
        const http = vi.fn(async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
        await expect(new WuzapiClient(config, creds, http).status(5)).rejects.toThrow(/session\/status → sem resposta: ECONNREFUSED/);
    });
});

describe('Endereço da mídia recebida pela WuzAPI (fixWuzapiMediaUrl)', () => {
    const PUB = 'https://pub-abc.r2.dev';
    const KEY = 'users/e2fe/inbox/556492957973/2026/11/17/audio/3EB0ABC.ogg';

    it('tira o bucket que a WuzAPI coloca no meio (R2 responde 404 com ele)', () => {
        expect(fixWuzapiMediaUrl(`${PUB}/kelmor-media/${KEY}`, PUB, 'kelmor-media')).toBe(`${PUB}/${KEY}`);
        expect(fixWuzapiMediaUrl(`${PUB}/kelmor-media/${KEY}`, `${PUB}/`, 'kelmor-media')).toBe(`${PUB}/${KEY}`);
    });

    it('endereço já certo, da bays ou de outro lugar passa sem mudança', () => {
        expect(fixWuzapiMediaUrl(`${PUB}/${KEY}`, PUB, 'kelmor-media')).toBe(`${PUB}/${KEY}`);
        expect(fixWuzapiMediaUrl(`${PUB}/media%2Ffoto.jpg`, PUB, 'kelmor-media')).toBe(`${PUB}/media%2Ffoto.jpg`);
        expect(fixWuzapiMediaUrl('https://outro.com/kelmor-media/x.ogg', PUB, 'kelmor-media')).toBe('https://outro.com/kelmor-media/x.ogg');
    });

    it('sem R2 configurado, não mexe', () => {
        expect(fixWuzapiMediaUrl(`${PUB}/kelmor-media/${KEY}`, undefined, undefined)).toBe(`${PUB}/kelmor-media/${KEY}`);
    });
});
