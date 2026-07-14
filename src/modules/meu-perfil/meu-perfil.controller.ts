import { FastifyRequest, FastifyReply } from 'fastify';
import { meuPerfilService } from './meu-perfil.service';

export const meuPerfilController = {

    async getProfile(req: FastifyRequest, reply: FastifyReply) {
        const profile = await meuPerfilService.getProfile(req.user.id);
        if (!profile) {
            return reply.status(404).send({ message: 'Usuário não encontrado' });
        }
        return reply.send(profile);
    },

    async listSelects(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const selects = await meuPerfilService.listSelects(companyId);
        return reply.send(selects);
    },

    async updateProfile(req: FastifyRequest, reply: FastifyReply) {
        const body = req.body as { nickname?: string | null; queue_ids?: number[]; connection_ids?: number[] };

        const changesQueuesOrConnections = body.queue_ids !== undefined || body.connection_ids !== undefined;
        if (changesQueuesOrConnections && req.user.profile_tag !== 'admin' && req.user.profile_tag !== 'superAdmin') {
            return reply.status(403).send({ message: 'Apenas administradores podem alterar suas conexões e filas' });
        }

        const result = await meuPerfilService.updateProfile(req.user.id, body);
        return reply.send(result);
    },

    async uploadAvatar(req: FastifyRequest, reply: FastifyReply) {
        const file = await (req as any).file();
        if (!file) return reply.status(400).send({ message: 'Arquivo não enviado' });

        const buffer: Buffer = await file.toBuffer();

        if (!meuPerfilService.isAllowedMimeType(file.mimetype)) {
            return reply.status(400).send({ message: 'Formato inválido. Use JPG, PNG ou WEBP.' });
        }
        if (!meuPerfilService.isWithinMaxSize(buffer.length)) {
            return reply.status(413).send({ message: 'Arquivo maior que 5MB' });
        }

        const result = await meuPerfilService.saveAvatar(req.user.id, {
            buffer,
            originalName: file.filename ?? 'avatar',
            mimeType: file.mimetype,
        });
        return reply.status(201).send(result);
    },
};
