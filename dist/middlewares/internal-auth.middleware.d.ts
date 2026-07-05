import type { FastifyRequest, FastifyReply } from 'fastify';
export declare function internalAuthMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void>;
/**
 * Autentica chamadas vindas do serviço bays (webhooks /connection/*).
 * O bays envia o header `secretkey` = SECRET_ACCESS_KEY, que é o mesmo valor
 * usado pelo Api-kelmor em BAYS_SECRET_KEY nas chamadas de saída.
 *
 * Fail-open quando BAYS_SECRET_KEY não está configurado (vazio): evita brickar
 * o recebimento de mensagens caso a env não esteja setada. Em produção o valor
 * é setado (as chamadas de saída para o bays já dependem dele).
 */
export declare function baysWebhookMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void>;
//# sourceMappingURL=internal-auth.middleware.d.ts.map