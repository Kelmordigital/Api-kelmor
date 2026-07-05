"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.internalAuthMiddleware = internalAuthMiddleware;
exports.baysWebhookMiddleware = baysWebhookMiddleware;
const env_1 = require("../config/env");
async function internalAuthMiddleware(request, reply) {
    const secret = request.headers['x-internal-secret'];
    if (!secret || secret !== env_1.env.INTERNAL_API_SECRET) {
        return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid internal secret' });
    }
}
/**
 * Autentica chamadas vindas do serviço bays (webhooks /connection/*).
 * O bays envia o header `secretkey` = SECRET_ACCESS_KEY, que é o mesmo valor
 * usado pelo Api-kelmor em BAYS_SECRET_KEY nas chamadas de saída.
 *
 * Fail-open quando BAYS_SECRET_KEY não está configurado (vazio): evita brickar
 * o recebimento de mensagens caso a env não esteja setada. Em produção o valor
 * é setado (as chamadas de saída para o bays já dependem dele).
 */
async function baysWebhookMiddleware(request, reply) {
    const expected = env_1.env.BAYS_SECRET_KEY;
    if (!expected)
        return; // não configurado → não bloqueia
    const provided = request.headers['secretkey'];
    if (provided !== expected) {
        return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid bays secret' });
    }
}
//# sourceMappingURL=internal-auth.middleware.js.map