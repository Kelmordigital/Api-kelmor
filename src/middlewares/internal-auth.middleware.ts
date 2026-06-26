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
