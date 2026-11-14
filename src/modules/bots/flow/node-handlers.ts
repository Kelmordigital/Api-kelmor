import type { Bot, BotNode } from '../bots.db.schema';
import type { BotMessenger, Recipient } from './bot-messenger';
import {
    chooseOption, evaluateCondition, interpolate, isValidCapture, parseNodeData,
    type FlowContext, type NodeData,
} from './flow-rules';

/** Uma conversa em andamento: com quem, por qual bot e as variáveis capturadas. */
export interface FlowRun {
    to: Recipient;
    bot: Bot;
    ctx: FlowContext;
}

/**
 * O que acontece depois do nó: seguir para `next`, parar esperando a resposta
 * do contato (`wait`) ou encerrar a conversa (`end`).
 */
export interface NodeOutcome {
    next: string | null;
    stop?: 'wait' | 'end';
}

/** Resposta do contato num nó que estava esperando. `stay`: continua esperando. */
export interface ReplyOutcome {
    next: string | null;
    stay?: boolean;
}

/** Comportamento de um tipo de nó. Tipo novo = um handler novo, sem mexer no motor. */
export interface NodeHandler {
    run(node: BotNode, data: NodeData, run: FlowRun): Promise<NodeOutcome>;
    reply?(node: BotNode, data: NodeData, message: string, run: FlowRun): Promise<ReplyOutcome>;
}

/** Espera configurada no nó antes de agir (até 30 s; nó "aguardar", até 5 min). */
export type Pause = (node: BotNode) => Promise<void>;

export const realPause: Pause = async (node) => {
    const secs = Math.min(node.delay_seconds ?? 0, node.type === 'wait' ? 300 : 30);
    if (secs > 0) await new Promise((r) => setTimeout(r, secs * 1000));
};

const follow = (node: BotNode): NodeOutcome => ({ next: node.next_node_id ?? null });
const say = (node: BotNode, run: FlowRun) => interpolate(node.message ?? '', run.ctx);

/** Início e mensagem: envia o texto e segue. */
export class MessageNode implements NodeHandler {
    constructor(private readonly messenger: BotMessenger, private readonly pause: Pause) {}
    async run(node: BotNode, _data: NodeData, run: FlowRun) {
        await this.pause(node);
        await this.messenger.text(run.to, say(node, run));
        return follow(node);
    }
}

export class WaitNode implements NodeHandler {
    constructor(private readonly pause: Pause) {}
    async run(node: BotNode) {
        await this.pause(node);
        return follow(node);
    }
}

/** Imagem/vídeo/documento, áudio e figurinha. */
export class MediaNode implements NodeHandler {
    constructor(private readonly messenger: BotMessenger, private readonly pause: Pause, private readonly absoluteUrl: (url: string) => string) {}
    async run(node: BotNode, data: NodeData, run: FlowRun) {
        await this.pause(node);
        if (data.media_url) {
            await this.messenger.media(run.to, {
                url: this.absoluteUrl(data.media_url),
                mimetype: data.media_mimetype ?? 'application/octet-stream',
                filename: data.media_filename ?? 'arquivo',
                sticker: node.type === 'sticker',
            }, node.type === 'media' ? say(node, run) : undefined);
        }
        return follow(node);
    }
}

/** Gera o QR do PIX e devolve a URL pública da imagem. */
export interface PixQrGenerator {
    payload(data: { key: string; merchantName: string; merchantCity: string; amount?: string }): string;
    image(payload: string): Promise<string>;
}

/** PIX: QR como imagem e, em seguida, o copia-e-cola. */
export class PixNode implements NodeHandler {
    constructor(private readonly messenger: BotMessenger, private readonly pause: Pause, private readonly pix: PixQrGenerator) {}
    async run(node: BotNode, data: NodeData, run: FlowRun) {
        await this.pause(node);
        if (data.pix_key) {
            const payload = this.pix.payload({ key: data.pix_key, merchantName: data.pix_name ?? '', merchantCity: data.pix_city ?? '', amount: data.pix_amount });
            const url = await this.pix.image(payload);
            await this.messenger.media(run.to, { url, mimetype: 'image/png', filename: 'pix.png' }, say(node, run) || undefined);
            await this.messenger.text(run.to, payload);
        }
        return follow(node);
    }
}

export class ContactCardNode implements NodeHandler {
    constructor(private readonly messenger: BotMessenger, private readonly pause: Pause) {}
    async run(node: BotNode, data: NodeData, run: FlowRun) {
        await this.pause(node);
        await this.messenger.text(run.to, say(node, run));
        if (data.contact_phone) await this.messenger.contactCard(run.to, data.contact_name || data.contact_phone, data.contact_phone);
        return follow(node);
    }
}

/** Histórico do rodízio: quantos leads o nó já distribuiu e quem recebeu cada um. */
export interface RotationLog {
    count(companyId: string, nodeId: string): Promise<number>;
    record(entry: { companyId: string; botId: number; nodeId: string; contactName: string | null; contactPhone: string; leadPhone: string | null; leadName: string | null }): Promise<void>;
}

/** RN-FLX-07: cada lead vai para o próximo contato da lista, em rodízio. */
export class RotateNode implements NodeHandler {
    constructor(private readonly messenger: BotMessenger, private readonly log: RotationLog) {}
    async run(node: BotNode, data: NodeData, run: FlowRun) {
        const contacts = (data.rotate_contacts ?? []).filter((c) => c.phone?.trim());
        if (contacts.length > 0) {
            const chosen = contacts[(await this.log.count(run.to.companyId, node.id)) % contacts.length];
            await this.log.record({
                companyId: run.to.companyId, botId: run.bot.id, nodeId: node.id,
                contactName: chosen.name || null, contactPhone: chosen.phone,
                leadPhone: run.ctx.telefone || null, leadName: run.ctx.nome || null,
            });
            if (data.rotate_notify?.trim()) {
                await this.messenger.notify(run.to.connectionId, chosen.phone, interpolate(data.rotate_notify, run.ctx));
            }
        }
        return follow(node);
    }
}

/** Link de grupo e avaliação no Google: texto + link. */
export class LinkNode implements NodeHandler {
    constructor(private readonly messenger: BotMessenger, private readonly pause: Pause) {}
    async run(node: BotNode, data: NodeData, run: FlowRun) {
        await this.pause(node);
        const text = [say(node, run).trim(), data.link?.trim()].filter(Boolean).join('\n\n');
        await this.messenger.text(run.to, text);
        return follow(node);
    }
}

export type ApplyTag = (companyId: string, contactId: number, tagId: string) => Promise<void>;

export class AddTagNode implements NodeHandler {
    constructor(private readonly applyTag: ApplyTag) {}
    async run(node: BotNode, data: NodeData, run: FlowRun) {
        if (data.tag_id && run.to.contactId != null) {
            await this.applyTag(run.to.companyId, Number(run.to.contactId), data.tag_id)
                .catch((err: Error) => console.error('[ChatbotExecutor] Falha ao aplicar etiqueta:', err.message));
        }
        return follow(node);
    }
}

export class ConditionNode implements NodeHandler {
    async run(_node: BotNode, data: NodeData, run: FlowRun) {
        return { next: (evaluateCondition(data, run.ctx) ? data.true_node_id : data.false_node_id) ?? null };
    }
}

/** Menu numerado em texto; espera a escolha (RN-FLX-04). */
export class MenuNode implements NodeHandler {
    constructor(private readonly messenger: BotMessenger, private readonly pause: Pause) {}
    async run(node: BotNode, data: NodeData, run: FlowRun): Promise<NodeOutcome> {
        await this.pause(node);
        const text = say(node, run);
        const lines = (data.options ?? []).map((o) => `${o.number}. ${o.label}`).join('\n');
        await this.messenger.text(run.to, lines ? (text ? `${text}\n\n${lines}` : lines) : text);
        return { next: null, stop: 'wait' };
    }
    async reply(_node: BotNode, data: NodeData, message: string) {
        return { next: chooseOption(data.options, message) };
    }
}

/** Enquete do WhatsApp (2+ opções) ou, com menos, menu em texto. */
export class PollNode implements NodeHandler {
    constructor(private readonly messenger: BotMessenger, private readonly pause: Pause) {}
    async run(node: BotNode, data: NodeData, run: FlowRun): Promise<NodeOutcome> {
        await this.pause(node);
        const options = (data.options ?? []).map((o) => o.label).filter(Boolean);
        if (options.length >= 2) {
            await this.messenger.poll(run.to, interpolate(node.message ?? 'Escolha uma opção:', run.ctx), options);
        } else {
            const lines = (data.options ?? []).map((o) => `${o.number}. ${o.label}`).join('\n');
            await this.messenger.text(run.to, interpolate(`${node.message ?? ''}\n\n${lines}`, run.ctx));
        }
        return { next: null, stop: 'wait' };
    }
    async reply(_node: BotNode, data: NodeData, message: string) {
        return { next: chooseOption(data.options, message) };
    }
}

/** Pergunta livre: guarda a resposta na variável e segue. */
export class QuestionNode implements NodeHandler {
    constructor(private readonly messenger: BotMessenger, private readonly pause: Pause) {}
    async run(node: BotNode, _data: NodeData, run: FlowRun): Promise<NodeOutcome> {
        await this.pause(node);
        await this.messenger.text(run.to, say(node, run));
        return { next: null, stop: 'wait' };
    }
    async reply(node: BotNode, data: NodeData, message: string, run: FlowRun) {
        if (data.variable_name) run.ctx[data.variable_name] = message.trim();
        return { next: node.next_node_id ?? null };
    }
}

/** Captura de dado com formato (RN-FLX-05): inválido avisa e continua esperando. */
export class CaptureNode extends QuestionNode {
    constructor(private readonly sender: BotMessenger, pause: Pause) { super(sender, pause); }
    async reply(node: BotNode, data: NodeData, message: string, run: FlowRun) {
        if (!isValidCapture(message, data.data_type)) {
            await this.sender.text(run.to, data.error_message?.trim() || 'Hmm, esse dado não parece válido. Pode tentar de novo? 🙏');
            return { next: null, stay: true };
        }
        return super.reply(node, data, message, run);
    }
}

export type RouteToQueue = (ticketId: number, companyId: string, queueId: number) => Promise<unknown>;

/** RN-FLX-08: transferir encerra o bot e manda o ticket para a fila (que pode distribuir). */
export class TransferNode implements NodeHandler {
    constructor(private readonly messenger: BotMessenger, private readonly route: RouteToQueue) {}
    async run(node: BotNode, data: NodeData, run: FlowRun): Promise<NodeOutcome> {
        await this.messenger.text(run.to, interpolate(data.transfer_message ?? node.message ?? '', run.ctx));
        if (node.queue_id && run.to.ticketId) {
            await this.route(run.to.ticketId, run.to.companyId, node.queue_id)
                .catch((err: Error) => console.error('[ChatbotExecutor] Falha ao rotear para fila:', err.message));
        }
        return { next: null, stop: 'end' };
    }
}

/** Fim: mensagem do nó e, se configurada, a mensagem de saída do bot. */
export class EndNode implements NodeHandler {
    constructor(private readonly messenger: BotMessenger, private readonly pause: Pause) {}
    async run(node: BotNode, _data: NodeData, run: FlowRun): Promise<NodeOutcome> {
        await this.pause(node);
        await this.messenger.text(run.to, say(node, run));
        if (run.bot.send_exit_message && run.bot.exit_message) await this.messenger.text(run.to, run.bot.exit_message);
        return { next: null, stop: 'end' };
    }
}

/** Tipo desconhecido: não faz nada e segue (fluxos antigos continuam andando). */
export const followNext: NodeHandler = { run: async (node) => follow(node) };

/** Executa um nó pelo handler do seu tipo. */
export function nodeData(node: BotNode): NodeData {
    return parseNodeData(node.node_data);
}
