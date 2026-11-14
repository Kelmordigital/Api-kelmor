/**
 * Corpos de envio da Cloud API (POST /<phone_number_id>/messages). Funções
 * puras: só montam o JSON, respeitando os limites da Meta.
 */

type BasePayload = {
    messaging_product: 'whatsapp';
    recipient_type: 'individual';
    to: string;
    context?: { message_id: string };
};

/** Destinatário só com dígitos; `replyToWamid` responde a uma mensagem. */
function base(to: string, replyToWamid?: string): BasePayload {
    const p: BasePayload = { messaging_product: 'whatsapp', recipient_type: 'individual', to: to.replace(/\D/g, '') };
    if (replyToWamid) p.context = { message_id: replyToWamid };
    return p;
}

export function buildTextPayload(to: string, text: string, replyToWamid?: string) {
    return { ...base(to, replyToWamid), type: 'text', text: { body: text, preview_url: false } };
}

/** Botões interativos — a Cloud API aceita no máximo 3 opções (título até 20). */
export function buildButtonsPayload(to: string, bodyText: string, buttons: { id: string; title: string }[]) {
    return {
        ...base(to),
        type: 'interactive',
        interactive: {
            type: 'button',
            body: { text: bodyText },
            action: {
                buttons: buttons.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title.slice(0, 20) } })),
            },
        },
    };
}

/** Lista interativa — para mais de 3 opções (até 10 linhas por seção). */
export function buildListPayload(
    to: string,
    bodyText: string,
    buttonLabel: string,
    rows: { id: string; title: string; description?: string }[],
    sectionTitle = 'Opções',
) {
    return {
        ...base(to),
        type: 'interactive',
        interactive: {
            type: 'list',
            body: { text: bodyText },
            action: {
                button: buttonLabel.slice(0, 20),
                sections: [{
                    title: sectionTitle.slice(0, 24),
                    rows: rows.slice(0, 10).map((r) => ({
                        id: r.id,
                        title: r.title.slice(0, 24),
                        ...(r.description ? { description: r.description.slice(0, 72) } : {}),
                    })),
                }],
            },
        },
    };
}

export function buildTemplatePayload(to: string, name: string, languageCode: string, components?: unknown[]) {
    return {
        ...base(to),
        type: 'template',
        template: { name, language: { code: languageCode }, ...(components?.length ? { components } : {}) },
    };
}

export type CloudMediaType = 'image' | 'video' | 'audio' | 'document';

/** Mídia por link público — a Meta baixa o arquivo da URL. Áudio não tem legenda; só documento tem nome. */
export function buildMediaPayload(
    to: string,
    mediaType: CloudMediaType,
    link: string,
    opts: { caption?: string; filename?: string } = {},
): BasePayload & { type: CloudMediaType } & Partial<Record<CloudMediaType, Record<string, string>>> {
    const media: Record<string, string> = { link };
    if (opts.caption && mediaType !== 'audio') media.caption = opts.caption;
    if (opts.filename && mediaType === 'document') media.filename = opts.filename;
    return { ...base(to), type: mediaType, [mediaType]: media };
}
