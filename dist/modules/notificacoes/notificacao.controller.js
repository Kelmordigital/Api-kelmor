"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificacaoController = void 0;
const zod_1 = require("zod");
const schema_validator_1 = require("../../core/validation/schema-validator");
const idParamsSchema = zod_1.z.object({
    id: zod_1.z.coerce.number({ error: 'id inválido' }).int('id inválido').positive('id inválido'),
});
/** Notificações do próprio usuário. */
class NotificacaoController {
    service;
    constructor(service) {
        this.service = service;
    }
    list = async (req, reply) => reply.send(await this.service.listMine(req.user.id));
    markRead = async (req, reply) => {
        const { id } = schema_validator_1.SchemaValidator.parse(idParamsSchema, req.params);
        await this.service.markRead(id, req.user.id);
        return reply.send({ ok: true });
    };
    markAllRead = async (req, reply) => {
        await this.service.markAllRead(req.user.id);
        return reply.send({ ok: true });
    };
}
exports.NotificacaoController = NotificacaoController;
//# sourceMappingURL=notificacao.controller.js.map