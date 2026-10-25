import { randomBytes, createHash } from 'crypto';
import { BadGatewayError, BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError } from '../../core/errors/http-errors';
import type { CompanyPermissionsReader } from '../configuracao-geral/configuracao-geral.service';
import type { CompanyResourceFilter } from '../companies/company-directory';
import type { ApiKeyRepository, ApiMessageLogRepository } from './api-messages.repository';

export class ApiMessagesDisabledError extends ForbiddenError {
    constructor() { super('Envio de mensagens via API está desativado para esta empresa'); }
}

export class ConnectionNotFoundError extends NotFoundError {
    constructor() { super('Conexão não encontrada para esta empresa'); }
}

const KEY_PREFIX = 'kelmor_';
const VISIBLE_PREFIX_LENGTH = 14;

/**
 * Chave de API da empresa, usada por sistemas externos no header X-Api-Key.
 * Só o hash (sha256) fica guardado: a chave em texto puro existe uma única vez,
 * na resposta de quem a gerou.
 */
export class ApiKeyService {
    constructor(private readonly repository: ApiKeyRepository) {}

    /** Gera (ou substitui) a chave. A anterior deixa de valer na hora. */
    async generateKey(companyId: string): Promise<{ key: string; prefix: string }> {
        const key = `${KEY_PREFIX}${randomBytes(24).toString('hex')}`;
        const prefix = key.slice(0, VISIBLE_PREFIX_LENGTH);
        await this.repository.save(companyId, ApiKeyService.hash(key), prefix);
        return { key, prefix };
    }

    async getKeyStatus(companyId: string): Promise<{ active: boolean; prefix: string | null; createdAt: Date | null }> {
        const row = await this.repository.findByCompany(companyId);
        if (!row || row.revoked_at) return { active: false, prefix: null, createdAt: null };
        return { active: true, prefix: row.key_prefix, createdAt: row.created_at };
    }

    revokeKey(companyId: string): Promise<void> {
        return this.repository.revoke(companyId);
    }

    /** Empresa dona de uma chave ativa, ou null se a chave é inválida ou foi revogada. */
    resolveCompanyByKey(rawKey: string): Promise<string | null> {
        return this.repository.companyByActiveHash(ApiKeyService.hash(rawKey));
    }

    /** Autentica uma requisição externa pela chave; lança 401 se não houver ou não valer. */
    async authenticate(rawKey: unknown): Promise<string> {
        if (!rawKey || typeof rawKey !== 'string') throw new UnauthorizedError('Chave de API não fornecida');
        const companyId = await this.resolveCompanyByKey(rawKey);
        if (!companyId) throw new UnauthorizedError('Chave de API inválida ou revogada');
        return companyId;
    }

    private static hash(rawKey: string): string {
        return createHash('sha256').update(rawKey).digest('hex');
    }
}

/** Entrega o texto no WhatsApp pela conexão. */
export interface MessageDelivery {
    sendText(connectionId: number, number: string, text: string): Promise<void>;
}

/** Registra a mensagem no histórico de conversa do contato; devolve o ticket. */
export interface ConversationLinker {
    attach(companyId: string, number: string, connectionId: number, message: string): Promise<number>;
}

export interface SendRequest {
    connectionId: number;
    number: string;
    message: string;
}

export const MESSAGE_MAX_LENGTH = 4096;

/** Valida e normaliza o corpo de POST /api-messages/send (número só com dígitos). */
export function parseSendRequest(body: unknown): SendRequest {
    const { connection_id, number, message } = (body ?? {}) as Record<string, unknown>;
    const text = typeof message === 'string' ? message.trim() : '';
    if (connection_id === undefined || connection_id === null || connection_id === '' || !number || !text) {
        throw new BadRequestError('connection_id, number e message são obrigatórios');
    }

    const connectionId = Number(connection_id);
    if (!Number.isInteger(connectionId) || connectionId <= 0) throw new BadRequestError('connection_id inválido');

    const digits = typeof number === 'string' || typeof number === 'number' ? String(number).replace(/\D/g, '') : '';
    if (digits.length < 10 || digits.length > 15) throw new BadRequestError('number inválido');

    if (text.length > MESSAGE_MAX_LENGTH) throw new BadRequestError(`A mensagem deve ter no máximo ${MESSAGE_MAX_LENGTH} caracteres`);
    return { connectionId, number: digits, message: text };
}

/**
 * Envio de mensagem transacional por sistemas externos. Todo envio feito
 * fica no log de auditoria; com "criar ticket" ligado, a mensagem também entra
 * no histórico de conversa do contato.
 */
export class ApiMessageService {
    constructor(
        private readonly permissions: CompanyPermissionsReader,
        private readonly resources: CompanyResourceFilter,
        private readonly delivery: MessageDelivery,
        private readonly logs: ApiMessageLogRepository,
        private readonly conversations: ConversationLinker,
    ) {}

    async sendMessage(companyId: string, request: SendRequest): Promise<{ ticketId: number | null }> {
        const perms = await this.permissions.forCompany(companyId);
        if (!perms.api_messages) throw new ApiMessagesDisabledError();

        const [owned] = await this.resources.ownedConnectionIds(companyId, [request.connectionId]);
        if (!owned) throw new ConnectionNotFoundError();

        try {
            await this.delivery.sendText(request.connectionId, request.number, request.message);
        } catch (err) {
            console.error(`[api-messages] Falha ao enviar (empresa ${companyId}, conexão ${request.connectionId}):`, err instanceof Error ? err.message : err);
            throw new BadGatewayError('Falha ao enviar a mensagem pela conexão. Verifique se ela está conectada.');
        }

        const logId = await this.logs.record({
            company_id: companyId, connection_id: request.connectionId, to_number: request.number, body: request.message,
        });
        if (!perms.create_ticket_api_msg) return { ticketId: null };

        const ticketId = await this.conversations.attach(companyId, request.number, request.connectionId, request.message);
        await this.logs.linkTicket(logId, ticketId);
        return { ticketId };
    }
}
