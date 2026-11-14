import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'crypto';
import { CloudWebhookService, type ConversationInbox } from '../../src/modules/whatsapp-oficial/whatsapp-oficial-webhook.service';
import { extFromMime } from '../../src/modules/whatsapp-oficial/inbound-adapters';
import { OfficialConnections, OfficialOnboarding } from '../../src/modules/whatsapp-oficial/whatsapp-oficial.service';
import type { CachedConnectionLookup, CloudMessageStore, OfficialConnectionRepository, StoredMessage } from '../../src/modules/whatsapp-oficial/whatsapp-oficial.repository';
import type { GraphApiClient } from '../../src/modules/whatsapp-oficial/graph-api.client';
import type { Connection } from '../../src/modules/atendimento/atendimento.db.schema';
import { ConflictError, NotFoundError, UnprocessableEntityError } from '../../src/core/errors/http-errors';
import {
    buildTextPayload,
    buildButtonsPayload,
    buildListPayload,
    buildTemplatePayload,
    buildMediaPayload,
} from '../../src/modules/whatsapp-oficial/cloud-api.payloads';
import {
    mapStatusToAck,
    extractMessageContent,
    resolveOrigin,
} from '../../src/modules/whatsapp-oficial/whatsapp-oficial-webhook.service';

/**
 * Testes unitários da integração com a API Oficial do WhatsApp (Cloud API):
 * montagem de payloads de envio e interpretação do webhook da Meta.
 */

describe('WhatsApp Oficial — payloads de envio', () => {
    it('monta payload de texto no formato da Cloud API', () => {
        const p = buildTextPayload('+55 (11) 99999-9999', 'Olá!');
        expect(p).toEqual({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: '5511999999999',
            type: 'text',
            text: { body: 'Olá!', preview_url: false },
        });
    });

    it('adiciona context.message_id em respostas (reply)', () => {
        const p = buildTextPayload('5511999999999', 'respondendo', 'wamid.ORIGINAL');
        expect(p.context).toEqual({ message_id: 'wamid.ORIGINAL' });
    });

    it('limita botões interativos a 3 e títulos a 20 chars', () => {
        const botoes = [
            { id: '1', title: 'Vendas' },
            { id: '2', title: 'Suporte técnico especializado' }, // > 20 chars
            { id: '3', title: 'Financeiro' },
            { id: '4', title: 'Excedente' },
        ];
        const p = buildButtonsPayload('5511999999999', 'Selecione a fila', botoes);
        expect(p.interactive.action.buttons).toHaveLength(3);
        expect(p.interactive.action.buttons[1].reply.title.length).toBeLessThanOrEqual(20);
        expect(p.interactive.type).toBe('button');
    });

    it('monta lista interativa com no máximo 10 linhas', () => {
        const rows = Array.from({ length: 12 }, (_, i) => ({ id: String(i), title: `Fila ${i}` }));
        const p = buildListPayload('5511999999999', 'Selecione a fila', 'Enviar', rows);
        expect(p.interactive.type).toBe('list');
        expect(p.interactive.action.sections[0].rows).toHaveLength(10);
    });

    it('monta payload de template com idioma e componentes', () => {
        const p = buildTemplatePayload('5511999999999', 'hello_world', 'pt_BR', [{ type: 'body' }]);
        expect(p.template).toEqual({
            name: 'hello_world',
            language: { code: 'pt_BR' },
            components: [{ type: 'body' }],
        });
    });

    it('omite components do template quando vazio', () => {
        const p = buildTemplatePayload('5511999999999', 'hello_world', 'pt_BR');
        expect(p.template).not.toHaveProperty('components');
    });

    it('mídia por link: caption só quando não é áudio, filename só em documento', () => {
        const img = buildMediaPayload('5511999999999', 'image', 'https://x/img.jpg', { caption: 'legenda' });
        expect(img.image).toEqual({ link: 'https://x/img.jpg', caption: 'legenda' });

        const audio = buildMediaPayload('5511999999999', 'audio', 'https://x/a.ogg', { caption: 'ignorada' });
        expect(audio.audio).toEqual({ link: 'https://x/a.ogg' });

        const doc = buildMediaPayload('5511999999999', 'document', 'https://x/f.pdf', { filename: 'proposta.pdf' });
        expect(doc.document).toEqual({ link: 'https://x/f.pdf', filename: 'proposta.pdf' });
    });
});

describe('WhatsApp Oficial — webhook (statuses → ack)', () => {
    it('mapeia os status da Meta para a escala de ack da UI', () => {
        expect(mapStatusToAck('sent')).toBe(2);
        expect(mapStatusToAck('delivered')).toBe(3);
        expect(mapStatusToAck('read')).toBe(4);
        expect(mapStatusToAck('failed')).toBe(0);
        expect(mapStatusToAck('qualquer_outro')).toBe(1);
    });
});

describe('WhatsApp Oficial — webhook (extração de conteúdo)', () => {
    it('extrai texto simples', () => {
        const r = extractMessageContent({ from: '551199', id: 'wamid.1', type: 'text', text: { body: 'Olá!' } });
        expect(r).toEqual({ body: 'Olá!' });
    });

    it('imagem usa caption ou placeholder e expõe media_id', () => {
        const comCaption = extractMessageContent({
            from: '551199', id: 'wamid.2', type: 'image',
            image: { id: 'MEDIA1', caption: 'foto do produto', mime_type: 'image/jpeg' },
        });
        expect(comCaption.body).toBe('foto do produto');
        expect(comCaption.mediaId).toBe('MEDIA1');
        expect(comCaption.mediaType).toBe('image');

        const semCaption = extractMessageContent({
            from: '551199', id: 'wamid.3', type: 'image', image: { id: 'MEDIA2' },
        });
        expect(semCaption.body).toBe('[Imagem]');
    });

    it('documento prioriza caption > filename > placeholder', () => {
        const r = extractMessageContent({
            from: '551199', id: 'wamid.4', type: 'document',
            document: { id: 'M', filename: 'nota.pdf', mime_type: 'application/pdf' },
        });
        expect(r.body).toBe('nota.pdf');
        expect(r.filename).toBe('nota.pdf');
    });

    it('respostas interativas viram o título da opção escolhida', () => {
        const botao = extractMessageContent({
            from: '551199', id: 'wamid.5', type: 'interactive',
            interactive: { type: 'button_reply', button_reply: { id: '2', title: 'Suporte' } },
        });
        expect(botao.body).toBe('Suporte');

        const lista = extractMessageContent({
            from: '551199', id: 'wamid.6', type: 'interactive',
            interactive: { type: 'list_reply', list_reply: { id: '7', title: 'Financeiro' } },
        });
        expect(lista.body).toBe('Financeiro');
    });

    it('tipo desconhecido não gera corpo (mensagem é descartada)', () => {
        const r = extractMessageContent({ from: '551199', id: 'wamid.7', type: 'unsupported' });
        expect(r.body).toBe('');
        expect(r.mediaId).toBeUndefined();
    });
});

describe('WhatsApp Oficial — origem do ticket', () => {
    it('mensagem vinda de anúncio gera origem rastreável', () => {
        const origem = resolveOrigin({
            from: '551199', id: 'wamid.8', type: 'text',
            referral: { source_type: 'ad', headline: 'Promoção de inverno', source_url: 'https://fb.me/xyz' },
        });
        expect(origem).toBe('Anúncio: Promoção de inverno');
    });

    it('mensagem comum usa a origem padrão', () => {
        expect(resolveOrigin({ from: '551199', id: 'wamid.9', type: 'text' })).toBe('WhatsApp Oficial');
    });
});

const conn = (over: Partial<Connection> = {}) => ({
    id: 1, company_id: 'co-a', type: 'whatsapp-oficial', wab_business_phonenumber_id: 'pn-1', wab_token: 'tok', ...over,
}) as Connection;

describe('CloudWebhookService', () => {
    const NOW = Date.UTC(2026, 10, 14, 12);
    const make = (opts: { secret?: string; firstTime?: boolean; existing?: Partial<StoredMessage> | null; found?: Connection | null } = {}) => {
        const lookup = { find: vi.fn(async () => (opts.found === undefined ? conn() : opts.found)) } as unknown as CachedConnectionLookup;
        const messages = {
            findByWamid: vi.fn(async () => (opts.existing ?? null) as StoredMessage | null),
            setWamid: vi.fn(async () => {}),
            setAck: vi.fn(async () => {}),
            logDeliveryFailure: vi.fn(async () => {}),
        } satisfies CloudMessageStore;
        const inbox = { receive: vi.fn(async (): Promise<{ messageId: number } | null> => ({ messageId: 77 })) } satisfies ConversationInbox;
        const media = { fetch: vi.fn(async () => 'https://r2/api/wab/x.jpg') };
        const dedup = { firstTime: vi.fn(async () => opts.firstTime ?? true) };
        const emit = vi.fn();
        const service = new CloudWebhookService(lookup, messages, inbox, media, dedup, emit,
            () => ({ verifyToken: 'verifica', appSecret: opts.secret ?? '' }), () => NOW, vi.fn());
        return { service, lookup, messages, inbox, media, dedup, emit };
    };
    const body = (value: object) => ({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { metadata: { phone_number_id: 'pn-1' }, ...value } }] }] });
    const text = (over: object = {}) => body({ contacts: [{ profile: { name: 'Ana' } }], messages: [{ from: '+55 11 98888-7777', id: 'wamid.1', type: 'text', text: { body: 'oi' }, ...over }] });

    it('handshake: devolve o desafio só com modo e token certos', () => {
        const { service } = make();
        expect(service.verifySubscription('subscribe', 'verifica', '99')).toBe('99');
        expect(service.verifySubscription('subscribe', 'errado', '99')).toBeNull();
        expect(service.verifySubscription('unsubscribe', 'verifica', '99')).toBeNull();
        expect(service.verifySubscription('subscribe', undefined, '99')).toBeNull();
    });

    it('assinatura: sem segredo aceita tudo; com segredo, só o HMAC-SHA256 do corpo cru', () => {
        expect(make().service.isAuthentic('{}', undefined)).toBe(true);
        const { service } = make({ secret: 's3cr3t' });
        const raw = '{"object":"whatsapp_business_account"}';
        expect(service.isAuthentic(raw, `sha256=${createHmac('sha256', 's3cr3t').update(raw).digest('hex')}`)).toBe(true);
        expect(service.isAuthentic(raw + ' ', `sha256=${createHmac('sha256', 's3cr3t').update(raw).digest('hex')}`)).toBe(false);
        expect(service.isAuthentic(raw, 'sha1=abc')).toBe(false);
        expect(service.isAuthentic(raw, undefined)).toBe(false);
    });

    it('mensagem nova vai para o atendimento com número limpo, nome e origem; o wamid é gravado', async () => {
        const { service, inbox, messages } = make();
        await service.handle(text());
        expect(inbox.receive).toHaveBeenCalledWith({
            companyId: 'co-a', connectionId: 1, number: '5511988887777', name: 'Ana', origin: 'WhatsApp Oficial',
            body: 'oi', mediaType: undefined, mediaUrl: undefined,
        });
        expect(messages.setWamid).toHaveBeenCalledWith(77, 'wamid.1');
    });

    it('resposta de pesquisa (inbox devolve null) não grava wamid', async () => {
        const { service, inbox, messages } = make();
        inbox.receive.mockResolvedValueOnce(null);
        await service.handle(text());
        expect(messages.setWamid).not.toHaveBeenCalled();
    });

    it('ignora: repetida (Redis ou banco), antiga, sem conexão, sem conteúdo, outro objeto', async () => {
        for (const [label, setup, payload] of [
            ['redis', make({ firstTime: false }), text()],
            ['banco', make({ existing: { id: 1 } }), text()],
            ['antiga', make(), text({ timestamp: String(NOW / 1000 - 25 * 3600) })],
            ['sem conexão', make({ found: null }), text()],
            ['sem conteúdo', make(), text({ type: 'unsupported' })],
            ['outro objeto', make(), { ...text(), object: 'page' }],
        ] as const) {
            await setup.service.handle(payload);
            expect(setup.inbox.receive, label).not.toHaveBeenCalled();
        }
    });

    it('mídia: baixa antes de entregar ao atendimento', async () => {
        const { service, inbox, media } = make();
        await service.handle(text({ type: 'image', image: { id: 'm-1', mime_type: 'image/jpeg' } }));
        expect(media.fetch).toHaveBeenCalledWith(conn(), expect.objectContaining({ mediaId: 'm-1', mediaType: 'image' }), 'wamid.1');
        expect(inbox.receive).toHaveBeenCalledWith(expect.objectContaining({ body: '[Imagem]', mediaType: 'image', mediaUrl: 'https://r2/api/wab/x.jpg' }));
    });

    it('status: sobe o ack e avisa; não regride; falha registra e avisa sem mexer no ack', async () => {
        const { service, messages, emit } = make({ existing: { id: 5, ticket_id: 9, ack: 2 } });
        await service.handle(body({ statuses: [{ id: 'w', status: 'read' }] }));
        expect(messages.setAck).toHaveBeenCalledWith(5, 4);
        expect(emit).toHaveBeenCalledWith('co-a', 'message:ack', { messageId: 5, ticketId: 9, ack: 4 });

        messages.setAck.mockClear();
        await service.handle(body({ statuses: [{ id: 'w', status: 'sent' }] }));
        expect(messages.setAck).not.toHaveBeenCalled();

        await service.handle(body({ statuses: [{ id: 'w', status: 'failed', errors: [{ code: 131026, title: 'Undeliverable' }] }] }));
        expect(messages.logDeliveryFailure).toHaveBeenCalledWith(expect.objectContaining({ connectionId: 1, code: 131026, message: 'Undeliverable' }));
        expect(emit).toHaveBeenLastCalledWith('co-a', 'message:ack', { messageId: 5, ticketId: 9, ack: 0, failed: true });
        expect(messages.setAck).not.toHaveBeenCalled();
    });

    it('erro numa mudança não impede as outras', async () => {
        const { service, inbox, lookup } = make();
        (lookup.find as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('redis caiu'));
        await service.handle({ object: 'whatsapp_business_account', entry: [{ changes: [text().entry[0].changes[0], text({ id: 'wamid.2' }).entry[0].changes[0]] }] });
        expect(inbox.receive).toHaveBeenCalledTimes(1);
    });
});

describe('OfficialOnboarding', () => {
    const make = (existing: Connection | null) => {
        const graph = {
            get: vi.fn(async (path: string) => (path.includes('platform_type') ? { platform_type: 'CLOUD_API' } : { display_phone_number: '+55', verified_name: 'Loja' })),
            post: vi.fn(),
            exchangeCode: vi.fn(),
        } as unknown as GraphApiClient;
        const repository = {
            findById: vi.fn(), findByPhoneNumberId: vi.fn(async () => existing),
            create: vi.fn(async (v) => ({ id: 10, ...v }) as unknown as Connection),
            update: vi.fn(async (id, v) => ({ id, ...v }) as unknown as Connection),
        } satisfies OfficialConnectionRepository;
        const lookup = { forget: vi.fn(async () => {}) } as unknown as CachedConnectionLookup;
        const settings = vi.fn(() => ({ appId: 'app', appSecret: 'sec', systemUserToken: '' }));
        return { repository, lookup, service: new OfficialOnboarding(graph, repository, lookup, settings, vi.fn()) };
    };
    const manual = { wabaId: 'w', phoneNumberId: 'pn', token: 't', name: undefined, code: undefined };

    it('número novo: cria e limpa o cache do número', async () => {
        const { service, repository, lookup } = make(null);
        const created = await service.connect('co-a', manual);
        expect(created).toMatchObject({ company_id: 'co-a', name: 'Loja', wab_token: 't', wab_is_registered: true });
        expect(repository.create).toHaveBeenCalled();
        expect(lookup.forget).toHaveBeenCalledWith('pn');
    });

    it('mesmo número na mesma empresa atualiza; em outra empresa, 409 sem gravar', async () => {
        const same = make(conn({ id: 3, company_id: 'co-a' }));
        await same.service.connect('co-a', manual);
        expect(same.repository.update).toHaveBeenCalledWith(3, expect.anything());

        const other = make(conn({ id: 4, company_id: 'co-b' }));
        await expect(other.service.connect('co-a', manual)).rejects.toBeInstanceOf(ConflictError);
        expect(other.repository.update).not.toHaveBeenCalled();
        expect(other.repository.create).not.toHaveBeenCalled();
    });

    it('sem token (nem do sistema) → 422', async () => {
        await expect(make(null).service.connect('co-a', { ...manual, token: undefined })).rejects.toEqual(
            new UnprocessableEntityError('Sem token da Meta: configure WAB_USER_TOKEN ou envie token'),
        );
    });
});

describe('OfficialConnections', () => {
    it('só a conexão oficial da própria empresa', async () => {
        const repository = { findById: vi.fn() } as unknown as OfficialConnectionRepository;
        const connections = new OfficialConnections(repository);
        (repository.findById as ReturnType<typeof vi.fn>).mockResolvedValue(conn());
        await expect(connections.owned('co-a', 1)).resolves.toMatchObject({ id: 1 });
        await expect(connections.owned('co-b', 1)).rejects.toBeInstanceOf(NotFoundError);
        (repository.findById as ReturnType<typeof vi.fn>).mockResolvedValue(conn({ type: 'whatsapp' }));
        await expect(connections.owned('co-a', 1)).rejects.toBeInstanceOf(NotFoundError);
    });
});

describe('extFromMime', () => {
    it('conhecidos, com parâmetros e desconhecidos', () => {
        expect(extFromMime('audio/ogg; codecs=opus')).toBe('ogg');
        expect(extFromMime('image/jpeg')).toBe('jpg');
        expect(extFromMime('application/zip')).toBe('zip');
        expect(extFromMime(undefined)).toBe('bin');
    });
});
