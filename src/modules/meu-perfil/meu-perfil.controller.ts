import type { FastifyRequest, FastifyReply } from 'fastify';
import { BadRequestError } from '../../core/errors/http-errors';
import { SchemaValidator } from '../../core/validation/schema-validator';
import type { MultipartFormReader } from '../../core/http/multipart-form-reader';
import { updateMeuPerfilSchema } from './meu-perfil.dto';
import type { MeuPerfilService } from './meu-perfil.service';

/** Adapta HTTP ⇄ MeuPerfilService. Sempre opera sobre o usuário autenticado. */
export class MeuPerfilController {
    constructor(
        private readonly service: MeuPerfilService,
        private readonly avatarReader: MultipartFormReader,
    ) {}

    getProfile = async (req: FastifyRequest, reply: FastifyReply) => {
        return reply.send(await this.service.getProfile(req.user.id));
    };

    listSelects = async (req: FastifyRequest, reply: FastifyReply) => {
        return reply.send(await this.service.listSelects(req.user.company_id));
    };

    updateProfile = async (req: FastifyRequest, reply: FastifyReply) => {
        const input = SchemaValidator.parse(updateMeuPerfilSchema, req.body);
        const canManageAssignments = req.user.profile_tag === 'admin' || req.user.profile_tag === 'superAdmin';
        return reply.send(await this.service.updateProfile(req.user.id, req.user.company_id, input, { canManageAssignments }));
    };

    uploadAvatar = async (req: FastifyRequest, reply: FastifyReply) => {
        const { file } = await this.avatarReader.read(req, `avatars/${req.user.id}`);
        if (!file) throw new BadRequestError('Arquivo não enviado');
        return reply.status(201).send(await this.service.saveAvatar(req.user.id, file));
    };
}
