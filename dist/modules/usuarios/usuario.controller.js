"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usuarioController = void 0;
const usuario_service_1 = require("./usuario.service");
exports.usuarioController = {
    async listSelects(req, reply) {
        const companyId = req.user.company_id;
        const [queues, connections] = await Promise.all([
            usuario_service_1.usuarioService.listQueues(companyId),
            usuario_service_1.usuarioService.listConnections(companyId),
        ]);
        return reply.send({ queues, connections });
    },
    async list(req, reply) {
        const companyId = req.user.company_id;
        const data = await usuario_service_1.usuarioService.list(companyId);
        return reply.send(data);
    },
    async create(req, reply) {
        const companyId = req.user.company_id;
        const body = req.body;
        if (!body.name?.trim() || !body.email?.trim() || !body.password?.trim()) {
            return reply.status(400).send({ message: 'Nome, e-mail e senha são obrigatórios' });
        }
        if (body.profile_id === 3) {
            return reply.status(403).send({ message: 'Não é permitido criar superAdmin' });
        }
        try {
            const user = await usuario_service_1.usuarioService.create(companyId, {
                name: body.name.trim(),
                email: body.email.trim(),
                password: body.password.trim(),
                profile_id: body.profile_id ?? 1,
                queue_ids: body.queue_ids ?? [],
                connection_ids: body.connection_ids ?? [],
            });
            return reply.status(201).send(user);
        }
        catch (err) {
            if (err.message === 'EMAIL_TAKEN') {
                return reply.status(409).send({ message: 'E-mail já cadastrado' });
            }
            throw err;
        }
    },
    async update(req, reply) {
        const { id } = req.params;
        const companyId = req.user.company_id;
        const body = req.body;
        if (body.profile_id === 3) {
            return reply.status(403).send({ message: 'Não é permitido definir superAdmin' });
        }
        const result = await usuario_service_1.usuarioService.update(id, companyId, body);
        if (!result)
            return reply.status(404).send({ message: 'Usuário não encontrado' });
        return reply.send({ ok: true });
    },
    async remove(req, reply) {
        const { id } = req.params;
        const companyId = req.user.company_id;
        if (id === req.user.id) {
            return reply.status(400).send({ message: 'Você não pode excluir seu próprio usuário' });
        }
        const removed = await usuario_service_1.usuarioService.remove(id, companyId);
        if (!removed) {
            return reply.status(404).send({ message: 'Usuário não encontrado' });
        }
        return reply.send({ ok: true });
    },
};
//# sourceMappingURL=usuario.controller.js.map