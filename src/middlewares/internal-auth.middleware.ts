import type { FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../config/env';

export async function internalAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const secret = request.headers['x-internal-secret'];

  if (!secret || secret !== env.INTERNAL_API_SECRET) {
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
export async function baysWebhookMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const expected = env.BAYS_SECRET_KEY;
  if (!expected) return; // não configurado → não bloqueia

  const provided = request.headers['secretkey'];
  if (provided !== expected) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid bays secret' });
  }
}
