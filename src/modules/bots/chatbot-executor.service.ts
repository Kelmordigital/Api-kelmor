import { and, eq, sql } from 'drizzle-orm';
import { Readable } from 'stream';
import QRCode from 'qrcode';
import { db } from '../../database/client';
import { env } from '../../config/env';
import { mediaStorage } from '../../config/media-storage';
import { DrizzleCompanyStatusReader } from '../companies/company-status';
import { botsRepository } from './bots.repository';
import { bot_rotate_log } from './bots.db.schema';
import { buildPixPayload } from './pix.util';
import { WhatsAppBotMessenger } from './flow/bot-messenger';
import { FlowEngine } from './flow/flow-engine';
import {
    AddTagNode, CaptureNode, ConditionNode, ContactCardNode, EndNode, LinkNode, MediaNode, MenuNode, MessageNode,
    PixNode, PollNode, QuestionNode, RotateNode, TransferNode, WaitNode, realPause,
    type NodeHandler, type PixQrGenerator, type RotationLog,
} from './flow/node-handlers';

/** Composição do motor dos fluxos: único lugar que escolhe as implementações concretas. */

const messenger = new WhatsAppBotMessenger(
    async () => (await import('../whatsapp/whatsapp.service')).whatsappService,
    async (ticketId, contactId, body, companyId) => {
        const { messageRecorder } = await import('../atendimento/atendimento.module');
        await messageRecorder.save(ticketId, contactId, body, true, companyId, {});
    },
);

/** Mídia guardada como /uploads/... vira endereço completo da API (o WhatsApp baixa por URL). */
const absoluteUrl = (url: string) =>
    /^https?:\/\//i.test(url) ? url : `${env.API_URL}${url.startsWith('/') ? '' : '/'}${url}`;

const pixQr: PixQrGenerator = {
    payload: buildPixPayload,
    async image(payload) {
        const png = await QRCode.toBuffer(payload, { width: 512, margin: 2 });
        return absoluteUrl((await mediaStorage.save('bots/pix', 'pix.png', 'image/png', Readable.from(png))).url);
    },
};

const rotationLog: RotationLog = {
    async count(companyId, nodeId) {
        const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(bot_rotate_log)
            .where(and(eq(bot_rotate_log.node_id, nodeId), eq(bot_rotate_log.company_id, companyId)));
        return count;
    },
    async record(e) {
        await db.insert(bot_rotate_log).values({
            company_id: e.companyId, bot_id: e.botId, node_id: e.nodeId, contact_name: e.contactName,
            contact_phone: e.contactPhone, lead_phone: e.leadPhone, lead_name: e.leadName,
        });
    },
};

const message = new MessageNode(messenger, realPause);
const media = new MediaNode(messenger, realPause, absoluteUrl);
const link = new LinkNode(messenger, realPause);
const question = new QuestionNode(messenger, realPause);

/** RN-FLX-10: o que cada tipo de nó faz. */
const handlers = new Map<string, NodeHandler>([
    ['start', message],
    ['message', message],
    ['wait', new WaitNode(realPause)],
    ['media', media],
    ['audio', media],
    ['sticker', media],
    ['pix', new PixNode(messenger, realPause, pixQr)],
    ['contact_card', new ContactCardNode(messenger, realPause)],
    ['rotate', new RotateNode(messenger, rotationLog)],
    ['group_link', link],
    ['google_review', link],
    ['add_tag', new AddTagNode(async (companyId, contactId, tagId) => {
        const { contactTagger } = await import('../etiquetas/etiqueta.module');
        await contactTagger.applyToContact(companyId, contactId, tagId);
    })],
    ['condition', new ConditionNode()],
    ['menu', new MenuNode(messenger, realPause)],
    ['poll', new PollNode(messenger, realPause)],
    ['question', question],
    ['capture', new CaptureNode(messenger, realPause)],
    ['transfer', new TransferNode(messenger, async (ticketId, companyId, queueId) => {
        const { botTicketGateway } = await import('../atendimento/atendimento.module');
        return botTicketGateway.routeToQueue(ticketId, companyId, queueId);
    })],
    ['end', new EndNode(messenger, realPause)],
]);

const engine = new FlowEngine(
    botsRepository,
    botsRepository,
    new DrizzleCompanyStatusReader(db),
    async (ticketId, companyId) => {
        const { botTicketGateway } = await import('../atendimento/atendimento.module');
        return botTicketGateway.isInBotFlow(ticketId, companyId);
    },
    messenger,
    handlers,
);

/** Porta de entrada usada pelos webhooks do WhatsApp (Baileys e Oficial). */
export const chatbotExecutorService = {
    async execute(
        companyId: string, connectionId: number, phone: string, userMessage: string,
        ticketId?: number, contactId?: number, contactName?: string,
    ): Promise<void> {
        try {
            await engine.receive({ companyId, connectionId, phone, message: userMessage, ticketId, contactId, contactName });
        } catch (err) {
            console.error('[ChatbotExecutor] Erro ao processar mensagem:', err);
        }
    },
};
