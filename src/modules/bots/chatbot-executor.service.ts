import { botsRepository } from './bots.repository';
import { whatsappService } from '../whatsapp/whatsapp.service';
import type { Bot, BotNode } from './bots.db.schema';

interface NodeData {
    options?: Array<{ number: number; label: string; next_node_id?: string }>;
    variable_name?: string;
    transfer_message?: string;
}

function parseNodeData(raw: string | null | undefined): NodeData {
    if (!raw) return {};
    try { return JSON.parse(raw); } catch { return {}; }
}

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

async function sendNodeMessage(
    connectionId: number, phone: string, node: BotNode,
): Promise<void> {
    const data = parseNodeData(node.node_data);
    let text = node.message ?? '';

    if (node.type === 'menu' && data.options?.length) {
        const lines = data.options.map(o => `${o.number}. ${o.label}`).join('\n');
        text = text ? `${text}\n\n${lines}` : lines;
    }

    if (node.type === 'transfer') {
        text = data.transfer_message ?? node.message ?? '';
    }

    if (!text.trim()) return;

    if ((node.delay_seconds ?? 0) > 0) {
        await new Promise(r => setTimeout(r, node.delay_seconds! * 1000));
    }

    await whatsappService.sendTextToPhone(connectionId, phone, text);
}

async function sendUntilInteractive(
    connectionId: number,
    phone: string,
    startNodeId: string,
    nodeMap: Map<string, BotNode>,
    bot: Bot,
    conversationId: number,
): Promise<{ finalNodeId: string; ended: boolean }> {
    let currentId = startNodeId;
    let ended = false;

    while (true) {
        const node = nodeMap.get(currentId);
        if (!node) break;

        await sendNodeMessage(connectionId, phone, node);

        if (node.type === 'menu' || node.type === 'question') break;

        if (node.type === 'transfer' || node.type === 'end') {
            if (node.type === 'end' && bot.send_exit_message && bot.exit_message) {
                await whatsappService.sendTextToPhone(connectionId, phone, bot.exit_message);
            }
            ended = true;
            break;
        }

        if (!node.next_node_id) break;
        currentId = node.next_node_id;
    }

    await botsRepository.updateConversation(conversationId, { current_node_id: currentId });
    return { finalNodeId: currentId, ended };
}

export const chatbotExecutorService = {
    async execute(
        companyId: string, connectionId: number, phone: string, userMessage: string,
    ): Promise<void> {
        try {
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

            if (!conversation) {
                const startNode = nodes.find(n => n.type === 'start');
                if (!startNode) return;

                conversation = await botsRepository.createConversation({
                    bot_id:          bot.id,
                    company_id:      companyId,
                    contact_phone:   phone,
                    current_node_id: startNode.id,
                    status:          'active',
                });

                const { ended } = await sendUntilInteractive(
                    connectionId, phone, startNode.id, nodeMap, bot, conversation.id,
                );
                if (ended) await botsRepository.updateConversation(conversation.id, { status: 'ended' });
                return;
            }

            const currentNode = conversation.current_node_id
                ? nodeMap.get(conversation.current_node_id)
                : undefined;

            if (!currentNode) return;

            let nextNodeId: string | null | undefined = null;

            if (currentNode.type === 'menu') {
                const data = parseNodeData(currentNode.node_data);
                const trimmed = userMessage.trim();
                const option = data.options?.find(o =>
                    String(o.number) === trimmed ||
                    o.label.toLowerCase().startsWith(trimmed.toLowerCase()),
                );
                nextNodeId = option?.next_node_id;
            } else {
                nextNodeId = currentNode.next_node_id;
            }

            if (!nextNodeId) return;

            const { ended } = await sendUntilInteractive(
                connectionId, phone, nextNodeId, nodeMap, bot, conversation.id,
            );
            if (ended) await botsRepository.updateConversation(conversation.id, { status: 'ended' });

        } catch (err) {
            console.error('[ChatbotExecutor] Erro ao processar mensagem:', err);
        }
    },
};
