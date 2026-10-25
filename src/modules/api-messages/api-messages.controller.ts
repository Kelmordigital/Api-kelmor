import type { FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '../../core/errors/http-errors';
import { requireCompanyId } from '../../core/http/http-router';
import { publicApiErrorBody } from '../../core/http/public-api-error';
import { parseSendRequest, type ApiKeyService, type ApiMessageService } from './api-messages.service';

/** Adapta HTTP ⇄ envio por API (público) e gestão da chave (admin). */
export class ApiMessagesController {
    constructor(
        private readonly keys: ApiKeyService,
        private readonly messages: ApiMessageService,
    ) {}

    /** POST /api-messages/send — autenticado por X-Api-Key; erros no formato da API pública. */
    send = async (req: FastifyRequest, reply: FastifyReply) => {
        try {
            const companyId = await this.keys.authenticate(req.headers['x-api-key']);
            const result = await this.messages.sendMessage(companyId, parseSendRequest(req.body));
            return reply.status(200).send({ sent: true, ticket_id: result.ticketId });
        } catch (err) {
            if (err instanceof AppError) return reply.status(err.statusCode).send(publicApiErrorBody(err));
            throw err;
        }
    };

    status = async (req: FastifyRequest, reply: FastifyReply) => reply.send(await this.keys.getKeyStatus(requireCompanyId(req)));

    generate = async (req: FastifyRequest, reply: FastifyReply) => reply.send(await this.keys.generateKey(requireCompanyId(req)));

    revoke = async (req: FastifyRequest, reply: FastifyReply) => {
        await this.keys.revokeKey(requireCompanyId(req));
        return reply.status(204).send();
    };
}
