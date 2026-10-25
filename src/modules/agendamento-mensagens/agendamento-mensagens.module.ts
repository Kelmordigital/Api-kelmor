import { db } from '../../database/client';
import { notifier } from '../notificacoes/notificacao.module';
import { DrizzleScheduledMessageRepository } from './agendamento-mensagens.repository';
import {
    AgendamentoMensagensService, DispatchLoop, ScheduledMessageDispatcher, type MessageSender,
} from './agendamento-mensagens.service';
import { AgendamentoMensagensController } from './agendamento-mensagens.controller';
import { AgendamentoMensagensRouter } from './agendamento-mensagens.routes';

/** Envio pelo WhatsApp. Import tardio: o módulo whatsapp também depende do atendimento. */
const whatsappSender: MessageSender = {
    async sendText(connectionId, target, text) {
        const { whatsappService } = await import('../whatsapp/whatsapp.service');
        await whatsappService.sendTextToPhone(connectionId, target, text);
    },
};

/** Composição do módulo: único lugar que escolhe as implementações concretas. */
const repository = new DrizzleScheduledMessageRepository(db);

/** Disparador periódico das mensagens vencidas; iniciado pelo main.ts. */
export const scheduledMessageLoop = new DispatchLoop(new ScheduledMessageDispatcher(repository, whatsappSender, notifier));

export const agendamentoMensagensService = new AgendamentoMensagensService(repository, () => scheduledMessageLoop.tick());

export const agendamentoMensagensRouter = new AgendamentoMensagensRouter(new AgendamentoMensagensController(agendamentoMensagensService));
