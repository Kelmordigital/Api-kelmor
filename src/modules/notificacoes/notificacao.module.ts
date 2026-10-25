import { db } from '../../database/client';
import { emitToUser } from '../../shared/socket';
import { DrizzleNotificationRepository } from './notificacao.repository';
import { NotificationService, type NotificationPush, type Notifier } from './notificacao.service';
import { NotificacaoController } from './notificacao.controller';
import { NotificacaoRouter } from './notificacao.routes';

/** Tempo real pelo socket. Só alcança quem está conectado nesta instância da API. */
const socketPush: NotificationPush = {
    push: (userId, notification) => emitToUser(userId, 'notification:new', notification),
};

/** Composição do módulo: único lugar que escolhe as implementações concretas. */
const service = new NotificationService(new DrizzleNotificationRepository(db), socketPush);

export const notificacaoRouter = new NotificacaoRouter(new NotificacaoController(service));

/** Porta exposta a outros módulos para avisar usuários. */
export const notifier: Notifier = service;
