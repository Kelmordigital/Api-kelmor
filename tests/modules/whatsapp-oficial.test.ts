import { describe, it, expect } from 'vitest';
import {
    buildTextPayload,
    buildButtonsPayload,
    buildListPayload,
    buildTemplatePayload,
    buildMediaPayload,
} from '../../src/modules/whatsapp-oficial/whatsapp-oficial.service';
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
