import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { SchemaValidator } from '../../core/validation/schema-validator';
import type { NotificationService } from './notificacao.service';

const idParamsSchema = z.object({
    id: z.coerce.number({ error: 'id inválido' }).int('id inválido').positive('id inválido'),
});

/** Notificações do próprio usuário. */
export class NotificacaoController {
    constructor(private readonly service: NotificationService) {}

    list = async (req: FastifyRequest, reply: FastifyReply) => reply.send(await this.service.listMine(req.user.id));

    markRead = async (req: FastifyRequest, reply: FastifyReply) => {
        const { id } = SchemaValidator.parse(idParamsSchema, req.params);
        await this.service.markRead(id, req.user.id);
        return reply.send({ ok: true });
    };

    markAllRead = async (req: FastifyRequest, reply: FastifyReply) => {
        await this.service.markAllRead(req.user.id);
        return reply.send({ ok: true });
    };
}
