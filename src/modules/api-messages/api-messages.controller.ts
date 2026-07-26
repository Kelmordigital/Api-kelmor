import { FastifyRequest, FastifyReply } from 'fastify';
import { apiMessagesService, ApiMessagesDisabledError, ConnectionNotFoundError } from './api-messages.service';

interface SendBody {
    connection_id?: number;
    number?: string;
    message?: string;
}

export const apiMessagesController = {

    /** POST /api-messages/send — autenticado por header X-Api-Key, não por JWT de usuário. */
    async send(req: FastifyRequest, reply: FastifyReply) {
        const rawKey = req.headers['x-api-key'];
        if (!rawKey || typeof rawKey !== 'string') {
            return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Chave de API não fornecida' });
        }

        const companyId = await apiMessagesService.resolveCompanyByKey(rawKey);
        if (!companyId) {
            return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Chave de API inválida ou revogada' });
        }

        const body = req.body as SendBody;
        if (!body.connection_id || !body.number || !body.message) {
            return reply.status(400).send({
                statusCode: 400, error: 'Bad Request',
                message: 'connection_id, number e message são obrigatórios',
            });
        }

        try {
            const result = await apiMessagesService.sendMessage(companyId, {
                connectionId: Number(body.connection_id),
                number: body.number,
                message: body.message,
            });
            return reply.status(200).send({ sent: true, ticket_id: result.ticketId });
        } catch (err) {
            if (err instanceof ApiMessagesDisabledError) {
                return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: err.message });
            }
            if (err instanceof ConnectionNotFoundError) {
                return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: err.message });
            }
            throw err;
        }
    },

    // ── Gestão da chave (JWT + admin) ───────────────────────────────────────

    async status(req: FastifyRequest, reply: FastifyReply) {
        const data = await apiMessagesService.getKeyStatus(req.user.company_id!);
        return reply.send(data);
    },

    async generate(req: FastifyRequest, reply: FastifyReply) {
        const data = await apiMessagesService.generateKey(req.user.company_id!);
        return reply.send(data);
    },

    async revoke(req: FastifyRequest, reply: FastifyReply) {
        await apiMessagesService.revokeKey(req.user.company_id!);
        return reply.status(204).send();
    },
};
