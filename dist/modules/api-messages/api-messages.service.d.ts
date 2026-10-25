import { ForbiddenError, NotFoundError } from '../../core/errors/http-errors';
import type { CompanyPermissionsReader } from '../configuracao-geral/configuracao-geral.service';
import type { CompanyResourceFilter } from '../companies/company-directory';
import type { ApiKeyRepository, ApiMessageLogRepository } from './api-messages.repository';
export declare class ApiMessagesDisabledError extends ForbiddenError {
    constructor();
}
export declare class ConnectionNotFoundError extends NotFoundError {
    constructor();
}
/**
 * Chave de API da empresa, usada por sistemas externos no header X-Api-Key.
 * Só o hash (sha256) fica guardado: a chave em texto puro existe uma única vez,
 * na resposta de quem a gerou.
 */
export declare class ApiKeyService {
    private readonly repository;
    constructor(repository: ApiKeyRepository);
    /** Gera (ou substitui) a chave. A anterior deixa de valer na hora. */
    generateKey(companyId: string): Promise<{
        key: string;
        prefix: string;
    }>;
    getKeyStatus(companyId: string): Promise<{
        active: boolean;
        prefix: string | null;
        createdAt: Date | null;
    }>;
    revokeKey(companyId: string): Promise<void>;
    /** Empresa dona de uma chave ativa, ou null se a chave é inválida ou foi revogada. */
    resolveCompanyByKey(rawKey: string): Promise<string | null>;
    /** Autentica uma requisição externa pela chave; lança 401 se não houver ou não valer. */
    authenticate(rawKey: unknown): Promise<string>;
    private static hash;
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
export declare const MESSAGE_MAX_LENGTH = 4096;
/** Valida e normaliza o corpo de POST /api-messages/send (número só com dígitos). */
export declare function parseSendRequest(body: unknown): SendRequest;
/**
 * Envio de mensagem transacional por sistemas externos. Todo envio feito
 * fica no log de auditoria; com "criar ticket" ligado, a mensagem também entra
 * no histórico de conversa do contato.
 */
export declare class ApiMessageService {
    private readonly permissions;
    private readonly resources;
    private readonly delivery;
    private readonly logs;
    private readonly conversations;
    constructor(permissions: CompanyPermissionsReader, resources: CompanyResourceFilter, delivery: MessageDelivery, logs: ApiMessageLogRepository, conversations: ConversationLinker);
    sendMessage(companyId: string, request: SendRequest): Promise<{
        ticketId: number | null;
    }>;
}
//# sourceMappingURL=api-messages.service.d.ts.map