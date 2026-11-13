import { ForbiddenError, NotFoundError } from '../../core/errors/http-errors';
import type { MediaStorage, StoredFile } from '../../core/storage/media-storage';
import type { MeuPerfilRepository, OwnProfile, ProfileOptions, UserFieldsPatch } from './meu-perfil.repository';
import type { UpdateMeuPerfilInput } from './meu-perfil.dto';

export interface ProfileUpdatePermissions {
    /** Só admin/superAdmin escolhem as próprias filas e conexões. */
    canManageAssignments: boolean;
}

/**
 * O perfil do próprio usuário. Nunca recebe o id de outra pessoa: quem chama
 * passa sempre o usuário autenticado.
 */
export class MeuPerfilService {
    constructor(
        private readonly repository: MeuPerfilRepository,
        private readonly storage: MediaStorage,
    ) {}

    async getProfile(userId: string): Promise<OwnProfile> {
        const profile = await this.repository.findProfile(userId);
        if (!profile) throw new NotFoundError('Usuário não encontrado');
        return profile;
    }

    /** Filas e conexões da empresa para escolher; quem não tem empresa não tem opções. */
    listSelects(companyId: string | null): Promise<ProfileOptions> {
        if (!companyId) return Promise.resolve({ queues: [], connections: [] });
        return this.repository.listOptions(companyId);
    }

    async updateProfile(
        userId: string,
        companyId: string | null,
        input: UpdateMeuPerfilInput,
        { canManageAssignments }: ProfileUpdatePermissions = { canManageAssignments: false },
    ): Promise<{ ok: true }> {
        const changesAssignments = input.queue_ids !== undefined || input.connection_ids !== undefined;
        if (changesAssignments && !canManageAssignments) {
            throw new ForbiddenError('Apenas administradores podem alterar suas conexões e filas');
        }

        const patch: UserFieldsPatch = {};
        if (input.nickname !== undefined) patch.nickname = input.nickname?.trim() || null;
        if (input.hide_name_active !== undefined) patch.hide_name_active = input.hide_name_active;
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
    async saveAvatar(userId: string, file: StoredFile): Promise<{ avatar_url: string }> {
        const url = file.url;
        const previousUrl = await this.repository.findAvatarUrl(userId);
        try {
            await this.repository.saveAvatar(userId, {
                url, original_name: file.originalName, mime_type: file.mimeType, size_bytes: file.size,
            });
        } catch (err) {
            await this.storage.delete(file.path);
            throw err;
        }
        if (previousUrl && previousUrl !== url) await this.storage.delete(previousUrl);
        return { avatar_url: url };
    }
}
