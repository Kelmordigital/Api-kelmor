import { eq } from 'drizzle-orm';
import type { DbExecutor } from '../../../core/database/executor';
import type { CompanyPermissionsReader } from '../../configuracao-geral/configuracao-geral.service';
import { users } from '../../auth/auth.schema';
import { contacts, type AtMessage } from '../atendimento.db.schema';
import type { WhatsappSender } from '../atendimento.ports';
import { AceiteAntesDeEnviarError, ContatoNaoPertenceAoTicketError } from '../atendimento.errors';
import type { TicketAccessPolicy } from '../tickets/ticket-access';
import type { TicketInboxService } from '../tickets/ticket-inbox.service';
import type { AutomaticMessages } from '../tickets/automatic-messages';
import type { MessageService } from './message.service';
import { withAttendantNamePrefix } from './attendant-name-prefix';

export interface OutgoingMessageInput {
    ticketId: number;
    companyId: string;
    userId: string;
    profileTag: string;
    body: string;
    fromMe: boolean;
    contactId?: number;
    hideName: boolean;
}

/** Mensagem digitada na tela do atendimento: portões, assinatura com o nome, gravação e envio. */
export class OutgoingMessageService {
    constructor(
        private readonly db: DbExecutor,
        private readonly inbox: Pick<TicketInboxService, 'getOrFail'>,
        private readonly access: Pick<TicketAccessPolicy, 'ensureCanSend'>,
        private readonly perms: CompanyPermissionsReader,
        private readonly messages: Pick<MessageService, 'save' | 'setWamid'>,
        private readonly connections: Pick<AutomaticMessages, 'resolveSendConnection'>,
        private readonly whatsapp: WhatsappSender,
    ) {}

    async send(input: OutgoingMessageInput): Promise<AtMessage> {
        const { ticketId, companyId, userId, profileTag, body, fromMe, contactId, hideName } = input;

        // O ticket precisa ser da empresa de quem envia (senão 404, sem gravar nada).
        const ticket = await this.inbox.getOrFail(ticketId, companyId);
        if (contactId != null && contactId !== ticket.contact_id) throw new ContatoNaoPertenceAoTicketError();

        // Pendente(1)/Fluxo(9) = ninguém aceitou: enviar não pode ser um jeito de "atender"
        // por trás do aceite (onde o limite de atendimentos é verificado).
        if (fromMe && (ticket.status_id === 1 || ticket.status_id === 9)) throw new AceiteAntesDeEnviarError();
        if (fromMe) this.access.ensureCanSend(ticket, userId, profileTag);

        // Assinatura "*Nome:*" quando a empresa permite e o atendente não pediu para ocultar.
        let outgoingBody = body;
        if (fromMe && !hideName && (await this.perms.forCompany(companyId)).allow_show_name_on_chat) {
            const [sender] = await this.db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
            if (sender?.name) outgoingBody = withAttendantNamePrefix(body, sender.name);
        }

        const msg = await this.messages.save(ticketId, contactId ?? null, outgoingBody, fromMe, companyId, { userId });
        if (fromMe) await this.deliver(ticket, msg, outgoingBody);
        return msg;
    }

    /** Envio pelo WhatsApp em segundo plano (número, LID ou sessão padrão). */
    private async deliver(ticket: { id: number; company_id: string; connection_id: number | null; contact_id: number }, msg: AtMessage, text: string): Promise<void> {
        const [contact] = await this.db.select().from(contacts).where(eq(contacts.id, ticket.contact_id)).limit(1);
        // Número do ticket caído/removido → responde por outro número conectado da empresa
        const connId = ticket.connection_id ? (await this.connections.resolveSendConnection(ticket)) ?? undefined : undefined;

        if (contact?.number) {
            const sending = connId ? this.whatsapp.sendTextToPhone(connId, contact.number, text) : this.whatsapp.sendMessage(contact.number, text);
            Promise.resolve(sending)
                .then(async (result) => {
                    const wamid = (result as { wabMessageId?: string } | void)?.wabMessageId;
                    if (wamid) await this.messages.setWamid(msg.id, wamid);
                })
                .catch((err: Error) => console.error('[sendMessage] erro no envio WhatsApp:', err.message));
        } else if (contact?.lid) {
            this.whatsapp.sendMessageViaLid(contact.lid, text, connId).catch((err: Error) => console.error('[sendMessage] bays error (lid):', err.message));
        } else {
            console.warn('[sendMessage] Contato sem número nem LID, não foi enviado via WhatsApp');
        }
    }
}
