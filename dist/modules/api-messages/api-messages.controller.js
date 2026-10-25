"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiMessagesController = void 0;
const http_errors_1 = require("../../core/errors/http-errors");
const http_router_1 = require("../../core/http/http-router");
const public_api_error_1 = require("../../core/http/public-api-error");
const api_messages_service_1 = require("./api-messages.service");
/** Adapta HTTP ⇄ envio por API (público) e gestão da chave (admin). */
class ApiMessagesController {
    keys;
    messages;
    constructor(keys, messages) {
        this.keys = keys;
        this.messages = messages;
    }
    /** POST /api-messages/send — autenticado por X-Api-Key; erros no formato da API pública. */
    send = async (req, reply) => {
        try {
            const companyId = await this.keys.authenticate(req.headers['x-api-key']);
            const result = await this.messages.sendMessage(companyId, (0, api_messages_service_1.parseSendRequest)(req.body));
            return reply.status(200).send({ sent: true, ticket_id: result.ticketId });
        }
        catch (err) {
            if (err instanceof http_errors_1.AppError)
                return reply.status(err.statusCode).send((0, public_api_error_1.publicApiErrorBody)(err));
            throw err;
        }
    };
    status = async (req, reply) => reply.send(await this.keys.getKeyStatus((0, http_router_1.requireCompanyId)(req)));
    generate = async (req, reply) => reply.send(await this.keys.generateKey((0, http_router_1.requireCompanyId)(req)));
    revoke = async (req, reply) => {
        await this.keys.revokeKey((0, http_router_1.requireCompanyId)(req));
        return reply.status(204).send();
    };
}
exports.ApiMessagesController = ApiMessagesController;
//# sourceMappingURL=api-messages.controller.js.map