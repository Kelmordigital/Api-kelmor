import type { MediaStorage, StoredFile } from '../../core/storage/media-storage';
import type { MeuPerfilRepository, OwnProfile, ProfileOptions } from './meu-perfil.repository';
import type { UpdateMeuPerfilInput } from './meu-perfil.dto';
export interface ProfileUpdatePermissions {
    /** Só admin/superAdmin escolhem as próprias filas e conexões. */
    canManageAssignments: boolean;
}
/**
 * O perfil do próprio usuário. Nunca recebe o id de outra pessoa: quem chama
 * passa sempre o usuário autenticado.
 */
export declare class MeuPerfilService {
    private readonly repository;
    private readonly storage;
    constructor(repository: MeuPerfilRepository, storage: MediaStorage);
    getProfile(userId: string): Promise<OwnProfile>;
    /** Filas e conexões da empresa para escolher; quem não tem empresa não tem opções. */
    listSelects(companyId: string | null): Promise<ProfileOptions>;
    updateProfile(userId: string, companyId: string | null, input: UpdateMeuPerfilInput, { canManageAssignments }?: ProfileUpdatePermissions): Promise<{
        ok: true;
    }>;
    /**
     * Troca a foto. A nova já chega gravada: só depois de registrá-la a antiga
     * é apagada — se algo falhar, o usuário continua com a foto anterior.
     */
    saveAvatar(userId: string, file: StoredFile): Promise<{
        avatar_url: string;
    }>;
}
//# sourceMappingURL=meu-perfil.service.d.ts.map