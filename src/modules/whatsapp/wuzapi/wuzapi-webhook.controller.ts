import type { FastifyReply, FastifyRequest } from 'fastify';
import { wuzapiModule } from './wuzapi.module';
import { translateConnectionEvent, translateMessage, type WuzapiWebhook } from './wuzapi-event-translator';

/**
 * POST /wuzapi/webhook/:id — eventos da WuzAPI para a conexão :id.
 * Autenticação: x-hmac-signature (HMAC-SHA256 do corpo cru com a chave da conexão).
 * Responde 200 rápido e processa em seguida: a WuzAPI reenvia em caso de erro/timeout,
 * e reenviar uma mensagem já gravada a duplicaria.
 */
export async function wuzapiWebhook(req: FastifyRequest, reply: FastifyReply) {
    const connectionId = Number((req.params as { id?: string }).id);
    if (!Number.isInteger(connectionId) || connectionId <= 0) {
        return reply.status(400).send({ error: 'id inválido' });
    }
    if (!wuzapiModule.isConfigured) {
        return reply.status(503).send({ error: 'WuzAPI não configurada' });
    }

    const rawBody = (req as FastifyRequest & { rawBody?: string }).rawBody ?? '';
    const signature = req.headers['x-hmac-signature'];
    if (!wuzapiModule.credentials.isValidSignature(connectionId, rawBody, Array.isArray(signature) ? signature[0] : signature)) {
        return reply.status(401).send({ error: 'assinatura inválida' });
    }

    const webhook = (req.body ?? {}) as WuzapiWebhook;
    reply.send({ ok: true });

    // Import tardio: o whatsapp.service importa este módulo (evita ciclo no carregamento)
    const { whatsappService } = await import('../whatsapp.service');
    try {
        const message = translateMessage(webhook);
        if (message?.media) message.media.url = wuzapiModule.mediaUrl(message.media.url);
        if (message) {
            await whatsappService.handleMessagesWebhook(connectionId, message);
            return;
        }

        const update = translateConnectionEvent(webhook);
        if (!update) return;

        // "Connected" não traz o número: pega na WuzAPI para gravar o serialized_id
        if (update.type === 'connected' && !update.serializedId) {
            const status = await wuzapiModule.client.status(connectionId).catch(() => null);
            if (status?.jid) update.serializedId = status.jid;
        }
        await whatsappService.handleConnectionUpdate(connectionId, update, { engine: 'wuzapi' });
    } catch (err) {
        console.error(`[WuzAPI:${connectionId}] erro ao processar webhook ${webhook.type}:`, err instanceof Error ? err.message : err);
    }
}
