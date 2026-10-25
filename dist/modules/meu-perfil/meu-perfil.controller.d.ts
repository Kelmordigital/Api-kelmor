import type { FastifyRequest, FastifyReply } from 'fastify';
import type { MultipartFormReader } from '../../core/http/multipart-form-reader';
import type { MeuPerfilService } from './meu-perfil.service';
/** Adapta HTTP ⇄ MeuPerfilService. Sempre opera sobre o usuário autenticado. */
export declare class MeuPerfilController {
    private readonly service;
    private readonly avatarReader;
    constructor(service: MeuPerfilService, avatarReader: MultipartFormReader);
    getProfile: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    listSelects: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    updateProfile: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    uploadAvatar: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
}
//# sourceMappingURL=meu-perfil.controller.d.ts.map