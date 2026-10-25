import { describe, it, expect, vi } from 'vitest';
import {
    ApiKeyService, ApiMessageService, ApiMessagesDisabledError, ConnectionNotFoundError, parseSendRequest,
} from '../../src/modules/api-messages/api-messages.service';
import type { ApiKeyRepository } from '../../src/modules/api-messages/api-messages.repository';
import type { CompanyPermission } from '../../src/modules/configuracao-geral/configuracao-geral.db.schema';
import { BadGatewayError, BadRequestError, UnauthorizedError } from '../../src/core/errors/http-errors';
import { publicApiErrorBody } from '../../src/core/http/public-api-error';

describe('parseSendRequest', () => {
    it('normaliza o número para dígitos e aceita connection_id em texto', () => {
        expect(parseSendRequest({ connection_id: '7', number: '+55 (11) 98888-7777', message: '  Oi  ' }))
            .toEqual({ connectionId: 7, number: '5511988887777', message: 'Oi' });
    });

    it.each([
        [{},                                                          'connection_id, number e message são obrigatórios'],
        [{ connection_id: 1, number: '5511999998888', message: ' ' }, 'connection_id, number e message são obrigatórios'],
        [{ connection_id: 'x', number: '5511999998888', message: 'a' }, 'connection_id inválido'],
        [{ connection_id: 1, number: '12345', message: 'a' },           'number inválido'],
        [{ connection_id: 1, number: '1'.repeat(16), message: 'a' },    'number inválido'],
        [{ connection_id: 1, number: '5511999998888', message: 'a'.repeat(4097) }, 'A mensagem deve ter no máximo 4096 caracteres'],
    ])('%j → %s', (body, message) => {
        expect(() => parseSendRequest(body)).toThrow(new BadRequestError(message));
    });
});

describe('ApiKeyService', () => {
    it('gera chave "kelmor_…", guarda só o hash e autentica por ela', async () => {
        let savedHash = '';
        const repo = {
            save: vi.fn(async (_c: string, hash: string) => { savedHash = hash; }),
            companyByActiveHash: vi.fn(async (hash: string) => (hash === savedHash ? 'c1' : null)),
        } as unknown as ApiKeyRepository;
        const service = new ApiKeyService(repo);

        const { key, prefix } = await service.generateKey('c1');
        expect(key).toMatch(/^kelmor_[0-9a-f]{48}$/);
        expect(prefix).toBe(key.slice(0, 14));
        expect(savedHash).not.toContain(key);
        expect(await service.authenticate(key)).toBe('c1');
        await expect(service.authenticate('kelmor_outra')).rejects.toEqual(new UnauthorizedError('Chave de API inválida ou revogada'));
        await expect(service.authenticate(undefined)).rejects.toEqual(new UnauthorizedError('Chave de API não fornecida'));
    });
});

describe('ApiMessageService', () => {
    const request = { connectionId: 3, number: '5511999998888', message: 'Pedido enviado' };

    function make(perms: Partial<CompanyPermission>, owned: number[] = [3]) {
        const delivery = { sendText: vi.fn(async () => {}) };
        const logs = { record: vi.fn(async () => 10), linkTicket: vi.fn(async () => {}) };
        const conversations = { attach: vi.fn(async () => 99) };
        const service = new ApiMessageService(
            { forCompany: async () => ({ api_messages: true, create_ticket_api_msg: false, ...perms }) as CompanyPermission },
            { ownedConnectionIds: async () => owned, ownedContactIds: async () => [] },
            delivery, logs, conversations,
        );
        return { service, delivery, logs, conversations };
    }

    it('envia e grava o log; sem "criar ticket" não toca no atendimento', async () => {
        const { service, delivery, logs, conversations } = make({});
        expect(await service.sendMessage('c1', request)).toEqual({ ticketId: null });
        expect(delivery.sendText).toHaveBeenCalledWith(3, '5511999998888', 'Pedido enviado');
        expect(logs.record).toHaveBeenCalledWith({ company_id: 'c1', connection_id: 3, to_number: '5511999998888', body: 'Pedido enviado' });
        expect(conversations.attach).not.toHaveBeenCalled();
    });

    it('com "criar ticket": vincula à conversa e ao log', async () => {
        const { service, logs } = make({ create_ticket_api_msg: true });
        expect(await service.sendMessage('c1', request)).toEqual({ ticketId: 99 });
        expect(logs.linkTicket).toHaveBeenCalledWith(10, 99);
    });

    it('desligado → 403; conexão de outra empresa → 404; nada é enviado', async () => {
        const off = make({ api_messages: false });
        await expect(off.service.sendMessage('c1', request)).rejects.toBeInstanceOf(ApiMessagesDisabledError);
        const foreign = make({}, []);
        await expect(foreign.service.sendMessage('c1', request)).rejects.toBeInstanceOf(ConnectionNotFoundError);
        expect(off.delivery.sendText).not.toHaveBeenCalled();
        expect(foreign.delivery.sendText).not.toHaveBeenCalled();
    });

    it('falha no WhatsApp → 502, sem log', async () => {
        const { service, delivery, logs } = make({});
        delivery.sendText.mockRejectedValueOnce(new Error('offline'));
        vi.spyOn(console, 'error').mockImplementationOnce(() => {});
        await expect(service.sendMessage('c1', request)).rejects.toBeInstanceOf(BadGatewayError);
        expect(logs.record).not.toHaveBeenCalled();
    });
});

describe('publicApiErrorBody', () => {
    it('formato da API pública', () => {
        expect(publicApiErrorBody(new UnauthorizedError('x'))).toEqual({ statusCode: 401, error: 'Unauthorized', message: 'x' });
    });
});
