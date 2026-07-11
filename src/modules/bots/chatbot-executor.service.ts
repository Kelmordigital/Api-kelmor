import { and, eq, sql } from 'drizzle-orm';
import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import QRCode from 'qrcode';
import { db } from '../../database/client';
import { env } from '../../config/env';
import { botsRepository } from './bots.repository';
import { bot_rotate_log } from './bots.db.schema';
import { buildPixPayload } from './pix.util';
import { whatsappService } from '../whatsapp/whatsapp.service';
import type { Bot, BotNode } from './bots.db.schema';

interface NodeData {
    options?: Array<{ number: number; label: string; next_node_id?: string }>;
    variable_name?: string;
    data_type?: 'texto' | 'nome' | 'email' | 'telefone' | 'cpf' | 'numero';
    error_message?: string;
    transfer_message?: string;
    trigger?: 'all' | 'keywords';
    trigger_keywords?: string;
    cond_variable?: string;
    cond_operator?: 'igual' | 'diferente' | 'contem' | 'nao_contem' | 'maior' | 'menor' | 'existe';
    cond_value?: string;
    true_node_id?: string;
    false_node_id?: string;
    media_url?: string;
    media_mimetype?: string;
    media_filename?: string;
    pix_key?: string;
    pix_name?: string;
    pix_city?: string;
    pix_amount?: string;
    contact_name?: string;
    contact_phone?: string;
    rotate_contacts?: Array<{ name: string; phone: string }>;
    rotate_notify?: string;
    link?: string;
    tag_id?: string;
}

type Context = Record<string, string>;

/** Nós que aguardam resposta do cliente antes de continuar. */
const INTERACTIVE_TYPES = ['menu', 'poll', 'capture', 'question'];

const MAX_STEPS = 50; // proteção contra loops (ex.: condição circular)

function parseNodeData(raw: string | null | undefined): NodeData {
    if (!raw) return {};
    try { return JSON.parse(raw); } catch { return {}; }
}

function parseContext(raw: string | null | undefined): Context {
    if (!raw) return {};
    try { return JSON.parse(raw); } catch { return {}; }
}

/** Substitui {{variavel}} e {variavel} pelos valores capturados. */
function interpolate(text: string, ctx: Context): string {
    return text
        .replace(/\{\{(\w+)\}\}/g, (_, k) => ctx[k] ?? '')
        .replace(/\{(\w+)\}/g, (_, k) => ctx[k] ?? '');
}

function mediaUrlAbsolute(url: string): string {
    if (/^https?:\/\//i.test(url)) return url;
    return `${env.API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

// ── Validação do Capturar Dado ───────────────────────────────────────────────

function validateCapture(value: string, type: NodeData['data_type']): boolean {
    const v = value.trim();
    if (!v) return false;
    switch (type) {
        case 'email':    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
        case 'telefone': return v.replace(/\D/g, '').length >= 10;
        case 'cpf':      return v.replace(/\D/g, '').length === 11;
        case 'numero':   return /^-?\d+([.,]\d+)?$/.test(v.replace(/\s/g, ''));
        case 'nome':     return /[a-zA-ZÀ-ÿ]{2,}/.test(v);
        default:         return true; // texto livre
    }
}

function evaluateCondition(data: NodeData, ctx: Context): boolean {
    const raw = ctx[data.cond_variable ?? ''] ?? '';
    const value = data.cond_value ?? '';
    const a = raw.trim().toLowerCase();
    const b = value.trim().toLowerCase();

    switch (data.cond_operator) {
        case 'existe':     return raw.trim().length > 0;
        case 'igual':      return a === b;
        case 'diferente':  return a !== b;
        case 'contem':     return a.includes(b);
        case 'nao_contem': return !a.includes(b);
        case 'maior':      return Number(a.replace(',', '.')) > Number(b.replace(',', '.'));
        case 'menor':      return Number(a.replace(',', '.')) < Number(b.replace(',', '.'));
        default:           return false;
    }
}

// ── Horário de funcionamento (inalterado) ────────────────────────────────────

function isWithinWorkingHours(bot: Bot): boolean {
    if (!bot.opening_hours) return true;

    const tz = bot.timezone ?? 'America/Sao_Paulo';
    const localStr = new Date().toLocaleString('en-US', { timeZone: tz, hour12: false });
    const local = new Date(localStr);

    const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
    const day = dayKeys[local.getDay()];
    const ini = (bot as any)[`${day}_ini`] as string | null;
    const fin = (bot as any)[`${day}_fin`] as string | null;

    if (!ini || !fin) return false;

    const [iniH, iniM] = ini.split(':').map(Number);
    const [finH, finM] = fin.split(':').map(Number);
    const nowMins = local.getHours() * 60 + local.getMinutes();

    return nowMins >= iniH * 60 + iniM && nowMins < finH * 60 + finM;
}

function isExpired(updatedAt: Date, timerMinutes: number): boolean {
    return (Date.now() - new Date(updatedAt).getTime()) / 60000 >= timerMinutes;
}

// ── Execução de um nó ────────────────────────────────────────────────────────

interface ExecEnv {
    companyId: string;
    connectionId: number;
    phone: string;
    ticketId?: number;
    contactId?: number;
    botId: number;
    ctx: Context;
}

async function applyDelay(node: BotNode): Promise<void> {
    const secs = Math.min(node.delay_seconds ?? 0, node.type === 'wait' ? 300 : 30);
    if (secs > 0) await new Promise(r => setTimeout(r, secs * 1000));
}

async function sendText(envr: ExecEnv, text: string): Promise<void> {
    const msg = interpolate(text, envr.ctx).trim();
    if (!msg) return;
    await logOutgoing(envr, msg);
    await whatsappService.sendTextToPhone(envr.connectionId, envr.phone, msg).catch((err: Error) =>
        console.error('[ChatbotExecutor] Falha ao enviar mensagem:', err.message));
}

/** Salva a mensagem que o bot mandou no histórico do ticket (user_id null = automático). */
async function logOutgoing(envr: ExecEnv, body: string, mediaType?: string): Promise<void> {
    if (!envr.ticketId || !envr.contactId || !body.trim()) return;
    const { messageService } = await import('../atendimento/message.service');
    await messageService.save(envr.ticketId, envr.contactId, body, true, envr.companyId, { mediaType }).catch((err: Error) =>
        console.error('[ChatbotExecutor] Falha ao salvar mensagem do bot:', err.message));
}

/**
 * Executa a AÇÃO de um nó (envio/efeito). Retorna o id do próximo nó quando o
 * fluxo segue direto, ou null quando o nó é interativo/terminal.
 */
async function runNode(node: BotNode, envr: ExecEnv, bot: Bot): Promise<string | null> {
    const data = parseNodeData(node.node_data);

    switch (node.type) {
        case 'start':
        case 'message': {
            await applyDelay(node);
            await sendText(envr, node.message ?? '');
            return node.next_node_id ?? null;
        }

        case 'wait': {
            await applyDelay(node);
            return node.next_node_id ?? null;
        }

        case 'media':
        case 'audio':
        case 'sticker': {
            await applyDelay(node);
            if (data.media_url) {
                await whatsappService.sendMediaToPhone(envr.connectionId, envr.phone, {
                    path: mediaUrlAbsolute(data.media_url),
                    mimetype: data.media_mimetype ?? 'application/octet-stream',
                    originalname: data.media_filename ?? 'arquivo',
                    sticker: node.type === 'sticker' ? true : undefined,
                }, node.type === 'media' ? interpolate(node.message ?? '', envr.ctx) : undefined);
            }
            return node.next_node_id ?? null;
        }

        case 'pix': {
            await applyDelay(node);
            if (data.pix_key) {
                const payload = buildPixPayload({
                    key: data.pix_key,
                    merchantName: data.pix_name ?? '',
                    merchantCity: data.pix_city ?? '',
                    amount: data.pix_amount,
                });

                // QR gerado em disco e servido via /uploads (o bays baixa por URL)
                const dir = path.join(process.cwd(), 'uploads', 'bots', 'pix');
                await fs.mkdir(dir, { recursive: true });
                const fileName = `pix-${randomUUID()}.png`;
                await QRCode.toFile(path.join(dir, fileName), payload, { width: 512, margin: 2 });

                await whatsappService.sendMediaToPhone(envr.connectionId, envr.phone, {
                    path: mediaUrlAbsolute(`/uploads/bots/pix/${fileName}`),
                    mimetype: 'image/png',
                    originalname: fileName,
                }, interpolate(node.message ?? '', envr.ctx) || undefined);

                // Copia-e-cola em mensagem separada (facilita o cliente copiar)
                await whatsappService.sendTextToPhone(envr.connectionId, envr.phone, payload);
            }
            return node.next_node_id ?? null;
        }

        case 'contact_card': {
            await applyDelay(node);
            await sendText(envr, node.message ?? '');
            if (data.contact_phone) {
                await whatsappService.sendContactCardToPhone(
                    envr.connectionId, envr.phone,
                    data.contact_name || data.contact_phone,
                    data.contact_phone,
                );
            }
            return node.next_node_id ?? null;
        }

        case 'rotate': {
            const contacts = (data.rotate_contacts ?? []).filter(c => c.phone?.trim());
            if (contacts.length > 0) {
                const [{ count }] = await db
                    .select({ count: sql<number>`count(*)::int` })
                    .from(bot_rotate_log)
                    .where(and(
                        eq(bot_rotate_log.node_id, node.id),
                        eq(bot_rotate_log.company_id, envr.companyId),
                    ));

                const chosen = contacts[count % contacts.length];

                await db.insert(bot_rotate_log).values({
                    company_id: envr.companyId,
                    bot_id: envr.botId,
                    node_id: node.id,
                    contact_name: chosen.name || null,
                    contact_phone: chosen.phone,
                    lead_phone: envr.ctx.telefone || null,
                    lead_name: envr.ctx.nome || null,
                });

                if (data.rotate_notify?.trim()) {
                    const notice = interpolate(data.rotate_notify, envr.ctx);
                    await whatsappService.sendTextToPhone(envr.connectionId, chosen.phone, notice)
                        .catch((err: Error) => console.error('[ChatbotExecutor] Falha ao notificar rodízio:', err.message));
                }
            }
            return node.next_node_id ?? null;
        }

        case 'group_link':
        case 'google_review': {
            await applyDelay(node);
            const text = [interpolate(node.message ?? '', envr.ctx).trim(), data.link?.trim()]
                .filter(Boolean).join('\n\n');
            if (text) await sendText(envr, text);
            return node.next_node_id ?? null;
        }

        case 'add_tag': {
            if (data.tag_id && envr.contactId != null) {
                const { etiquetaService } = await import('../etiquetas/etiqueta.service');
                await etiquetaService.aplicarAoContato(String(envr.contactId), data.tag_id, envr.companyId)
                    .catch((err: Error) => console.error('[ChatbotExecutor] Falha ao aplicar etiqueta:', err.message));
            }
            return node.next_node_id ?? null;
        }

        case 'condition': {
            const result = evaluateCondition(data, envr.ctx);
            return (result ? data.true_node_id : data.false_node_id) ?? null;
        }

        case 'menu': {
            await applyDelay(node);
            let text = interpolate(node.message ?? '', envr.ctx);
            if (data.options?.length) {
                const lines = data.options.map(o => `${o.number}. ${o.label}`).join('\n');
                text = text ? `${text}\n\n${lines}` : lines;
            }
            if (text.trim()) {
                await logOutgoing(envr, text);
                await whatsappService.sendTextToPhone(envr.connectionId, envr.phone, text).catch((err: Error) =>
                    console.error('[ChatbotExecutor] Falha ao enviar menu:', err.message));
            }
            return null; // aguarda resposta
        }

        case 'poll': {
            await applyDelay(node);
            const options = (data.options ?? []).map(o => o.label).filter(Boolean);
            if (options.length >= 2) {
                await whatsappService.sendPollToPhone(
                    envr.connectionId, envr.phone,
                    interpolate(node.message ?? 'Escolha uma opção:', envr.ctx),
                    options,
                );
            } else {
                // Enquete sem opções suficientes: envia como texto numerado
                const lines = (data.options ?? []).map(o => `${o.number}. ${o.label}`).join('\n');
                await sendText(envr, `${node.message ?? ''}\n\n${lines}`);
            }
            return null; // aguarda voto/resposta
        }

        case 'capture':
        case 'question': {
            await applyDelay(node);
            await sendText(envr, node.message ?? '');
            return null; // aguarda resposta
        }

        case 'transfer': {
            const text = data.transfer_message ?? node.message ?? '';
            if (text.trim()) await sendText(envr, text);
            if (node.queue_id && envr.ticketId) {
                const { ticketService } = await import('../atendimento/ticket.service');
                await ticketService.routeToQueue(envr.ticketId, envr.companyId, node.queue_id)
                    .catch((err: Error) => console.error('[ChatbotExecutor] Falha ao rotear para fila:', err.message));
            }
            return null; // terminal
        }

        case 'end': {
            await applyDelay(node);
            await sendText(envr, node.message ?? '');
            if (bot.send_exit_message && bot.exit_message) {
                await whatsappService.sendTextToPhone(envr.connectionId, envr.phone, bot.exit_message);
            }
            return null; // terminal
        }

        default:
            return node.next_node_id ?? null;
    }
}

/**
 * Caminha pelo fluxo executando nós até chegar num interativo (espera resposta)
 * ou num terminal (transfer/end/sem próximo).
 */
async function walk(
    startNodeId: string,
    nodeMap: Map<string, BotNode>,
    envr: ExecEnv,
    bot: Bot,
    conversationId: number,
): Promise<{ finalNodeId: string; ended: boolean }> {
    let currentId = startNodeId;
    let ended = false;

    for (let step = 0; step < MAX_STEPS; step++) {
        const node = nodeMap.get(currentId);
        if (!node) break;

        const nextId = await runNode(node, envr, bot);

        if (INTERACTIVE_TYPES.includes(node.type)) break;

        if (node.type === 'transfer' || node.type === 'end') {
            ended = true;
            break;
        }

        if (!nextId) break;
        currentId = nextId;
    }

    await botsRepository.updateConversation(conversationId, {
        current_node_id: currentId,
        context: JSON.stringify(envr.ctx),
    });
    return { finalNodeId: currentId, ended };
}

/** Resolve a resposta do usuário num nó interativo → próximo nó (ou null). */
async function resolveReply(
    node: BotNode,
    userMessage: string,
    envr: ExecEnv,
): Promise<{ nextId: string | null; stay: boolean }> {
    const data = parseNodeData(node.node_data);
    const trimmed = userMessage.trim();

    if (node.type === 'menu' || node.type === 'poll') {
        const option = data.options?.find(o =>
            String(o.number) === trimmed ||
            o.label.trim().toLowerCase() === trimmed.toLowerCase() ||
            o.label.toLowerCase().startsWith(trimmed.toLowerCase()),
        );
        return { nextId: option?.next_node_id ?? null, stay: false };
    }

    if (node.type === 'capture') {
        if (!validateCapture(trimmed, data.data_type)) {
            const errMsg = data.error_message?.trim() || 'Hmm, esse dado não parece válido. Pode tentar de novo? 🙏';
            await whatsappService.sendTextToPhone(envr.connectionId, envr.phone, errMsg);
            return { nextId: null, stay: true };
        }
        if (data.variable_name) envr.ctx[data.variable_name] = trimmed;
        return { nextId: node.next_node_id ?? null, stay: false };
    }

    if (node.type === 'question') {
        if (data.variable_name) envr.ctx[data.variable_name] = trimmed;
        return { nextId: node.next_node_id ?? null, stay: false };
    }

    return { nextId: node.next_node_id ?? null, stay: false };
}

/** O Gatilho por palavras-chave decide se o bot inicia para esta mensagem. */
function triggerMatches(startNode: BotNode, userMessage: string): boolean {
    const data = parseNodeData(startNode.node_data);
    if (data.trigger !== 'keywords') return true;

    const keywords = (data.trigger_keywords ?? '')
        .split(',')
        .map(k => k.trim().toLowerCase())
        .filter(Boolean);
    if (keywords.length === 0) return true;

    const msg = userMessage.toLowerCase();
    return keywords.some(k => msg.includes(k));
}

export const chatbotExecutorService = {
    async execute(
        companyId: string, connectionId: number, phone: string, userMessage: string,
        ticketId?: number, contactId?: number, contactName?: string,
    ): Promise<void> {
        try {
            // Bots NUNCA respondem grupos — guarda extra além do descarte no webhook
            if (phone.includes('@g.us')) return;

            // Reconfere o status do ticket: se um atendente assumiu entre o
            // webhook decidir chamar o bot e este ponto rodar, aborta sem
            // enviar nada — status_id é a única fonte de verdade do roteamento.
            if (ticketId != null) {
                const { ticketService, shouldRunBot } = await import('../atendimento/ticket.service');
                const ticket = await ticketService.get(ticketId, companyId);
                if (!ticket || !shouldRunBot(ticket)) return;
            }

            const bot = await botsRepository.findDefaultActive(companyId);
            if (!bot) return;

            if (!isWithinWorkingHours(bot)) {
                if (bot.offline_message) {
                    await whatsappService.sendTextToPhone(connectionId, phone, bot.offline_message);
                }
                return;
            }

            const nodes = await botsRepository.getNodes(bot.id, companyId);
            const nodeMap = new Map(nodes.map(n => [n.id, n]));

            let conversation = await botsRepository.findActiveConversation(companyId, bot.id, phone);

            if (conversation && isExpired(conversation.updated_at!, bot.response_timer)) {
                await botsRepository.updateConversation(conversation.id, { status: 'ended' });
                conversation = undefined;
            }

            const baseCtx: Context = {
                nome: contactName ?? '',
                telefone: phone.replace(/\D/g, ''),
            };

            if (!conversation) {
                const startNode = nodes.find(n => n.type === 'start');
                if (!startNode) return;
                if (!triggerMatches(startNode, userMessage)) return;

                conversation = await botsRepository.createConversation({
                    bot_id:          bot.id,
                    company_id:      companyId,
                    contact_phone:   phone,
                    current_node_id: startNode.id,
                    status:          'active',
                    context:         JSON.stringify(baseCtx),
                });

                const envr: ExecEnv = { companyId, connectionId, phone, ticketId, contactId, botId: bot.id, ctx: baseCtx };
                const { ended } = await walk(startNode.id, nodeMap, envr, bot, conversation.id);
                if (ended) await botsRepository.updateConversation(conversation.id, { status: 'ended' });
                return;
            }

            const currentNode = conversation.current_node_id
                ? nodeMap.get(conversation.current_node_id)
                : undefined;

            if (!currentNode) return;

            const ctx: Context = { ...baseCtx, ...parseContext(conversation.context) };
            const envr: ExecEnv = { companyId, connectionId, phone, ticketId, contactId, botId: bot.id, ctx };

            const { nextId, stay } = await resolveReply(currentNode, userMessage, envr);

            if (stay) {
                await botsRepository.updateConversation(conversation.id, { context: JSON.stringify(ctx) });
                return;
            }
            if (!nextId) return;

            const { ended } = await walk(nextId, nodeMap, envr, bot, conversation.id);
            if (ended) await botsRepository.updateConversation(conversation.id, { status: 'ended' });

        } catch (err) {
            console.error('[ChatbotExecutor] Erro ao processar mensagem:', err);
        }
    },
};
