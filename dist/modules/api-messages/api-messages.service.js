"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiMessageService = exports.MESSAGE_MAX_LENGTH = exports.ApiKeyService = exports.ConnectionNotFoundError = exports.ApiMessagesDisabledError = void 0;
exports.parseSendRequest = parseSendRequest;
const crypto_1 = require("crypto");
const http_errors_1 = require("../../core/errors/http-errors");
class ApiMessagesDisabledError extends http_errors_1.ForbiddenError {
    constructor() { super('Envio de mensagens via API está desativado para esta empresa'); }
}
exports.ApiMessagesDisabledError = ApiMessagesDisabledError;
class ConnectionNotFoundError extends http_errors_1.NotFoundError {
    constructor() { super('Conexão não encontrada para esta empresa'); }
}
exports.ConnectionNotFoundError = ConnectionNotFoundError;
const KEY_PREFIX = 'kelmor_';
const VISIBLE_PREFIX_LENGTH = 14;
/**
 * Chave de API da empresa, usada por sistemas externos no header X-Api-Key.
 * Só o hash (sha256) fica guardado: a chave em texto puro existe uma única vez,
 * na resposta de quem a gerou.
 */
class ApiKeyService {
    repository;
    constructor(repository) {
        this.repository = repository;
    }
    /** Gera (ou substitui) a chave. A anterior deixa de valer na hora. */
    async generateKey(companyId) {
        const key = `${KEY_PREFIX}${(0, crypto_1.randomBytes)(24).toString('hex')}`;
        const prefix = key.slice(0, VISIBLE_PREFIX_LENGTH);
        await this.repository.save(companyId, ApiKeyService.hash(key), prefix);
        return { key, prefix };
    }
    async getKeyStatus(companyId) {
        const row = await this.repository.findByCompany(companyId);
        if (!row || row.revoked_at)
            return { active: false, prefix: null, createdAt: null };
        return { active: true, prefix: row.key_prefix, createdAt: row.created_at };
    }
    revokeKey(companyId) {
        return this.repository.revoke(companyId);
    }
    /** Empresa dona de uma chave ativa, ou null se a chave é inválida ou foi revogada. */
    resolveCompanyByKey(rawKey) {
        return this.repository.companyByActiveHash(ApiKeyService.hash(rawKey));
    }
    /** Autentica uma requisição externa pela chave; lança 401 se não houver ou não valer. */
    async authenticate(rawKey) {
        if (!rawKey || typeof rawKey !== 'string')
            throw new http_errors_1.UnauthorizedError('Chave de API não fornecida');
        const companyId = await this.resolveCompanyByKey(rawKey);
        if (!companyId)
            throw new http_errors_1.UnauthorizedError('Chave de API inválida ou revogada');
        return companyId;
    }
    static hash(rawKey) {
        return (0, crypto_1.createHash)('sha256').update(rawKey).digest('hex');
    }
}
exports.ApiKeyService = ApiKeyService;
exports.MESSAGE_MAX_LENGTH = 4096;
/** Valida e normaliza o corpo de POST /api-messages/send (número só com dígitos). */
function parseSendRequest(body) {
    const { connection_id, number, message } = (body ?? {});
    const text = typeof message === 'string' ? message.trim() : '';
    if (connection_id === undefined || connection_id === null || connection_id === '' || !number || !text) {
        throw new http_errors_1.BadRequestError('connection_id, number e message são obrigatórios');
    }
    const connectionId = Number(connection_id);
    if (!Number.isInteger(connectionId) || connectionId <= 0)
        throw new http_errors_1.BadRequestError('connection_id inválido');
    const digits = typeof number === 'string' || typeof number === 'number' ? String(number).replace(/\D/g, '') : '';
    if (digits.length < 10 || digits.length > 15)
        throw new http_errors_1.BadRequestError('number inválido');
    if (text.length > exports.MESSAGE_MAX_LENGTH)
        throw new http_errors_1.BadRequestError(`A mensagem deve ter no máximo ${exports.MESSAGE_MAX_LENGTH} caracteres`);
    return { connectionId, number: digits, message: text };
}
/**
 * Envio de mensagem transacional por sistemas externos. Todo envio feito
 * fica no log de auditoria; com "criar ticket" ligado, a mensagem também entra
 * no histórico de conversa do contato.
 */
class ApiMessageService {
    permissions;
    resources;
    delivery;
    logs;
    conversations;
    constructor(permissions, resources, delivery, logs, conversations) {
        this.permissions = permissions;
        this.resources = resources;
        this.delivery = delivery;
        this.logs = logs;
        this.conversations = conversations;
    }
    async sendMessage(companyId, request) {
        const perms = await this.permissions.forCompany(companyId);
        if (!perms.api_messages)
            throw new ApiMessagesDisabledError();
        const [owned] = await this.resources.ownedConnectionIds(companyId, [request.connectionId]);
        if (!owned)
            throw new ConnectionNotFoundError();
        try {
            await this.delivery.sendText(request.connectionId, request.number, request.message);
        }
        catch (err) {
            console.error(`[api-messages] Falha ao enviar (empresa ${companyId}, conexão ${request.connectionId}):`, err instanceof Error ? err.message : err);
            throw new http_errors_1.BadGatewayError('Falha ao enviar a mensagem pela conexão. Verifique se ela está conectada.');
        }
        const logId = await this.logs.record({
            company_id: companyId, connection_id: request.connectionId, to_number: request.number, body: request.message,
        });
        if (!perms.create_ticket_api_msg)
            return { ticketId: null };
        const ticketId = await this.conversations.attach(companyId, request.number, request.connectionId, request.message);
        await this.logs.linkTicket(logId, ticketId);
        return { ticketId };
    }
}
exports.ApiMessageService = ApiMessageService;
//# sourceMappingURL=api-messages.service.js.map