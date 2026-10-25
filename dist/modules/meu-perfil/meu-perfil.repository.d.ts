import type { DB } from '../../database/client';
export interface OwnProfile {
    id: string;
    name: string;
    nickname: string | null;
    email: string;
    profile_tag: string;
    profile_name: string;
    avatar_url: string | null;
    hide_name_active: boolean;
    queue_ids: number[];
    connection_ids: number[];
}
export interface ProfileOptions {
    queues: {
        id: number;
        name: string;
        color: string | null;
    }[];
    connections: {
        id: number;
        name: string;
        status: string | null;
    }[];
}
export interface UserFieldsPatch {
    nickname?: string | null;
    hide_name_active?: boolean;
}
export interface AvatarData {
    url: string;
    original_name: string;
    mime_type: string;
    size_bytes: number;
}
/** Dados do próprio usuário espalhados entre users, filas/conexões e avatar. */
export interface MeuPerfilRepository {
    findProfile(userId: string): Promise<OwnProfile | null>;
    listOptions(companyId: string): Promise<ProfileOptions>;
    updateUser(userId: string, patch: UserFieldsPatch): Promise<void>;
    /**
     * Substitui as filas/conexões do usuário pelas informadas que pertencem à
     * empresa (ids de outra empresa são descartados). Tudo numa transação.
     */
    replaceAssignments(userId: string, companyId: string | null, assignments: {
        queueIds?: number[];
        connectionIds?: number[];
    }): Promise<void>;
    findAvatarUrl(userId: string): Promise<string | null>;
    saveAvatar(userId: string, avatar: AvatarData): Promise<void>;
}
export declare class DrizzleMeuPerfilRepository implements MeuPerfilRepository {
    private readonly db;
    constructor(db: DB);
    findProfile(userId: string): Promise<OwnProfile | null>;
    listOptions(companyId: string): Promise<ProfileOptions>;
    updateUser(userId: string, patch: UserFieldsPatch): Promise<void>;
    replaceAssignments(userId: string, companyId: string | null, { queueIds, connectionIds }: {
        queueIds?: number[];
        connectionIds?: number[];
    }): Promise<void>;
    findAvatarUrl(userId: string): Promise<string | null>;
    saveAvatar(userId: string, avatar: AvatarData): Promise<void>;
    private ownedQueueIds;
    private ownedConnectionIds;
}
//# sourceMappingURL=meu-perfil.repository.d.ts.map