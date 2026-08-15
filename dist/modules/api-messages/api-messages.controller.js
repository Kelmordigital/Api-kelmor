"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiMessagesController = void 0;
const api_messages_service_1 = require("./api-messages.service");
exports.apiMessagesController = {
    /** POST /api-messages/send — autenticado por header X-Api-Key, não por JWT de usuário. */
    async send(req, reply) {
        const rawKey = req.headers['x-api-key'];
        if (!rawKey || typeof rawKey !== 'string') {
            return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Chave de API não fornecida' });
        }
        const companyId = await api_messages_service_1.apiMessagesService.resolveCompanyByKey(rawKey);
        if (!companyId) {
            return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Chave de API inválida ou revogada' });
        }
        const body = req.body;
        if (!body.connection_id || !body.number || !body.message) {
            return reply.status(400).send({
                statusCode: 400, error: 'Bad Request',
                message: 'connection_id, number e message são obrigatórios',
            });
        }
        try {
            const result = await api_messages_service_1.apiMessagesService.sendMessage(companyId, {
                connectionId: Number(body.connection_id),
                number: body.number,
                message: body.message,
            });
            return reply.status(200).send({ sent: true, ticket_id: result.ticketId });
        }
        catch (err) {
            if (err instanceof api_messages_service_1.ApiMessagesDisabledError) {
                return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: err.message });
            }
            if (err instanceof api_messages_service_1.ConnectionNotFoundError) {
                return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: err.message });
            }
            throw err;
        }
    },
    // ── Gestão da chave (JWT + admin) ───────────────────────────────────────
    async status(req, reply) {
        const data = await api_messages_service_1.apiMessagesService.getKeyStatus(req.user.company_id);
        return reply.send(data);
    },
    async generate(req, reply) {
        const data = await api_messages_service_1.apiMessagesService.generateKey(req.user.company_id);
        return reply.send(data);
    },
    async revoke(req, reply) {
        await api_messages_service_1.apiMessagesService.revokeKey(req.user.company_id);
        return reply.status(204).send();
    },
};
//# sourceMappingURL=api-messages.controller.js.map