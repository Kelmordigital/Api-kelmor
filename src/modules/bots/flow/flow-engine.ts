import type { BotNode } from '../bots.db.schema';
import type { BotConversationStore, BotFlowReader } from '../bots.repository';
import type { CompanyStatusReader } from '../../companies/company-status';
import type { BotMessenger, Recipient } from './bot-messenger';
import { WorkingHours, isExpired, parseContext, startTriggerMatches, type FlowContext } from './flow-rules';
import { followNext, nodeData, type FlowRun, type NodeHandler } from './node-handlers';

/** Proteção contra fluxo em loop (ex.: condição que aponta para si mesma). */
const MAX_STEPS = 50;

/** Mensagem que chegou de um contato. */
export interface IncomingMessage extends Recipient {
    message: string;
    contactName?: string;
}

/** O ticket ainda está com o bot? (se um atendente assumiu, o bot não responde) */
export type TicketGate = (ticketId: number, companyId: string) => Promise<boolean>;

/**
 * Conduz a conversa do contato pelo fluxo do bot padrão ativo da empresa:
 * começa, continua de onde parou, espera respostas e encerra.
 */
export class FlowEngine {
    constructor(
        private readonly flows: BotFlowReader,
        private readonly conversations: BotConversationStore,
        private readonly companies: CompanyStatusReader,
        private readonly ticketWithBot: TicketGate,
        private readonly messenger: BotMessenger,
        private readonly handlers: ReadonlyMap<string, NodeHandler>,
        private readonly now: () => Date = () => new Date(),
    ) {}

    async receive(incoming: IncomingMessage): Promise<void> {
        const { companyId, phone } = incoming;
        // RN-FLX-01: o bot nunca responde grupos, mensagem vazia nem empresa desativada
        if (phone.includes('@g.us') || !incoming.message.trim()) return;
        if (!(await this.companies.isActive(companyId))) return;
        if (incoming.ticketId != null && !(await this.ticketWithBot(incoming.ticketId, companyId))) return;

        const bot = await this.flows.findDefaultActive(companyId);
        if (!bot) return;

        const to: Recipient = { companyId, connectionId: incoming.connectionId, phone, ticketId: incoming.ticketId, contactId: incoming.contactId };
        if (!WorkingHours.isOpen(bot, this.now())) {
            if (bot.offline_message) await this.messenger.text(to, bot.offline_message);
            return;
        }

        const nodes = new Map((await this.flows.getNodes(bot.id, companyId)).map((n) => [n.id, n]));
        const base: FlowContext = { nome: incoming.contactName ?? '', telefone: phone.replace(/\D/g, '') };

        let conversation = await this.conversations.findActiveConversation(companyId, bot.id, phone);
        if (conversation && isExpired(conversation.updated_at!, bot.response_timer, this.now())) {
            await this.conversations.updateConversation(conversation.id, { status: 'ended' });
            conversation = undefined;
        }

        if (!conversation) {
            const start = [...nodes.values()].find((n) => n.type === 'start');
            if (!start || !startTriggerMatches(start, incoming.message)) return;
            const created = await this.conversations.createConversation({
                bot_id: bot.id, company_id: companyId, contact_phone: phone,
                current_node_id: start.id, status: 'active', context: JSON.stringify(base),
            });
            await this.guard(created.id, () => this.walk(start.id, nodes, { to, bot, ctx: base }, created.id));
            return;
        }

        const current = conversation.current_node_id ? nodes.get(conversation.current_node_id) : undefined;
        if (!current) return;

        const run: FlowRun = { to, bot, ctx: { ...base, ...parseContext(conversation.context) } };
        const conversationId = conversation.id;
        await this.guard(conversationId, async () => {
            const handler = this.handlerFor(current);
            const reply = handler.reply
                ? await handler.reply(current, nodeData(current), incoming.message, run)
                : { next: current.next_node_id ?? null };
            if (reply.stay) {
                await this.conversations.updateConversation(conversationId, { context: JSON.stringify(run.ctx) });
                return;
            }
            if (reply.next) await this.walk(reply.next, nodes, run, conversationId);
        });
    }

    /** Executa nós até um que espera resposta, um que encerra, ou o fim do caminho. */
    private async walk(startId: string, nodes: Map<string, BotNode>, run: FlowRun, conversationId: number): Promise<void> {
        let currentId = startId;
        let ended = false;
        for (let step = 0; step < MAX_STEPS; step++) {
            const node = nodes.get(currentId);
            if (!node) break;
            const outcome = await this.handlerFor(node).run(node, nodeData(node), run);
            if (outcome.stop === 'end') { ended = true; break; }
            if (outcome.stop === 'wait' || !outcome.next) break;
            currentId = outcome.next;
        }
        await this.conversations.updateConversation(conversationId, {
            current_node_id: currentId, context: JSON.stringify(run.ctx), ...(ended ? { status: 'ended' } : {}),
        });
    }

    /** Fluxo que quebra no meio fica marcado com erro, em vez de preso em silêncio. */
    private async guard(conversationId: number, work: () => Promise<void>): Promise<void> {
        try {
            await work();
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error('[ChatbotExecutor] Fluxo falhou:', err);
            await this.conversations.updateConversation(conversationId, { status: 'error', error_message: message.slice(0, 500) })
                .catch((e: Error) => console.error('[ChatbotExecutor] Falha ao registrar erro:', e.message));
        }
    }

    private handlerFor(node: BotNode): NodeHandler {
        return this.handlers.get(node.type) ?? followNext;
    }
}

