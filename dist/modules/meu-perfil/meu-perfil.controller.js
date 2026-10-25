"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MeuPerfilController = void 0;
const http_errors_1 = require("../../core/errors/http-errors");
const schema_validator_1 = require("../../core/validation/schema-validator");
const meu_perfil_dto_1 = require("./meu-perfil.dto");
/** Adapta HTTP ⇄ MeuPerfilService. Sempre opera sobre o usuário autenticado. */
class MeuPerfilController {
    service;
    avatarReader;
    constructor(service, avatarReader) {
        this.service = service;
        this.avatarReader = avatarReader;
    }
    getProfile = async (req, reply) => {
        return reply.send(await this.service.getProfile(req.user.id));
    };
    listSelects = async (req, reply) => {
        return reply.send(await this.service.listSelects(req.user.company_id));
    };
    updateProfile = async (req, reply) => {
        const input = schema_validator_1.SchemaValidator.parse(meu_perfil_dto_1.updateMeuPerfilSchema, req.body);
        const canManageAssignments = req.user.profile_tag === 'admin' || req.user.profile_tag === 'superAdmin';
        return reply.send(await this.service.updateProfile(req.user.id, req.user.company_id, input, { canManageAssignments }));
    };
    uploadAvatar = async (req, reply) => {
        const { file } = await this.avatarReader.read(req, `avatars/${req.user.id}`);
        if (!file)
            throw new http_errors_1.BadRequestError('Arquivo não enviado');
        return reply.status(201).send(await this.service.saveAvatar(req.user.id, file));
    };
}
exports.MeuPerfilController = MeuPerfilController;
//# sourceMappingURL=meu-perfil.controller.js.map