"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MeuPerfilService = void 0;
const http_errors_1 = require("../../core/errors/http-errors");
/**
 * O perfil do próprio usuário. Nunca recebe o id de outra pessoa: quem chama
 * passa sempre o usuário autenticado.
 */
class MeuPerfilService {
    repository;
    storage;
    constructor(repository, storage) {
        this.repository = repository;
        this.storage = storage;
    }
    async getProfile(userId) {
        const profile = await this.repository.findProfile(userId);
        if (!profile)
            throw new http_errors_1.NotFoundError('Usuário não encontrado');
        return profile;
    }
    /** Filas e conexões da empresa para escolher; quem não tem empresa não tem opções. */
    listSelects(companyId) {
        if (!companyId)
            return Promise.resolve({ queues: [], connections: [] });
        return this.repository.listOptions(companyId);
    }
    async updateProfile(userId, companyId, input, { canManageAssignments } = { canManageAssignments: false }) {
        const changesAssignments = input.queue_ids !== undefined || input.connection_ids !== undefined;
        if (changesAssignments && !canManageAssignments) {
            throw new http_errors_1.ForbiddenError('Apenas administradores podem alterar suas conexões e filas');
        }
        const patch = {};
        if (input.nickname !== undefined)
            patch.nickname = input.nickname?.trim() || null;
        if (input.hide_name_active !== undefined)
            patch.hide_name_active = input.hide_name_active;
        await this.repository.updateUser(userId, patch);
        if (changesAssignments) {
            await this.repository.replaceAssignments(userId, companyId, {
                queueIds: input.queue_ids,
                connectionIds: input.connection_ids,
            });
        }
        return { ok: true };
    }
    /**
     * Troca a foto. A nova já chega gravada: só depois de registrá-la a antiga
     * é apagada — se algo falhar, o usuário continua com a foto anterior.
     */
    async saveAvatar(userId, file) {
        const url = `/${file.path}`;
        const previousUrl = await this.repository.findAvatarUrl(userId);
        try {
            await this.repository.saveAvatar(userId, {
                url, original_name: file.originalName, mime_type: file.mimeType, size_bytes: file.size,
            });
        }
        catch (err) {
            await this.storage.delete(file.path);
            throw err;
        }
        if (previousUrl && previousUrl !== url)
            await this.storage.delete(previousUrl.replace(/^\//, ''));
        return { avatar_url: url };
    }
}
exports.MeuPerfilService = MeuPerfilService;
//# sourceMappingURL=meu-perfil.service.js.map