"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.meuPerfilController = void 0;
const meu_perfil_service_1 = require("./meu-perfil.service");
exports.meuPerfilController = {
    async getProfile(req, reply) {
        const profile = await meu_perfil_service_1.meuPerfilService.getProfile(req.user.id);
        if (!profile) {
            return reply.status(404).send({ message: 'Usuário não encontrado' });
        }
        return reply.send(profile);
    },
    async listSelects(req, reply) {
        const companyId = req.user.company_id;
        const selects = await meu_perfil_service_1.meuPerfilService.listSelects(companyId);
        return reply.send(selects);
    },
    async updateProfile(req, reply) {
        const body = req.body;
        const changesQueuesOrConnections = body.queue_ids !== undefined || body.connection_ids !== undefined;
        if (changesQueuesOrConnections && req.user.profile_tag !== 'admin' && req.user.profile_tag !== 'superAdmin') {
            return reply.status(403).send({ message: 'Apenas administradores podem alterar suas conexões e filas' });
        }
        const result = await meu_perfil_service_1.meuPerfilService.updateProfile(req.user.id, req.user.company_id, body);
        return reply.send(result);
    },
    async uploadAvatar(req, reply) {
        const file = await req.file();
        if (!file)
            return reply.status(400).send({ message: 'Arquivo não enviado' });
        const buffer = await file.toBuffer();
        if (!meu_perfil_service_1.meuPerfilService.isAllowedMimeType(file.mimetype)) {
            return reply.status(400).send({ message: 'Formato inválido. Use JPG, PNG ou WEBP.' });
        }
        if (!meu_perfil_service_1.meuPerfilService.isWithinMaxSize(buffer.length)) {
            return reply.status(413).send({ message: 'Arquivo maior que 5MB' });
        }
        const result = await meu_perfil_service_1.meuPerfilService.saveAvatar(req.user.id, {
            buffer,
            originalName: file.filename ?? 'avatar',
            mimeType: file.mimetype,
        });
        return reply.status(201).send(result);
    },
};
//# sourceMappingURL=meu-perfil.controller.js.map