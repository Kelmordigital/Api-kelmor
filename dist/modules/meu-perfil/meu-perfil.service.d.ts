export declare const meuPerfilService: {
    getProfile(userId: string): Promise<{
        queue_ids: number[];
        connection_ids: number[];
        id: string;
        name: string;
        nickname: string | null;
        email: string;
        profile_tag: string;
        profile_name: string;
        avatar_url: string | null;
        hide_name_active: boolean;
    } | null>;
    listSelects(companyId: string): Promise<{
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
    }>;
    updateProfile(userId: string, payload: {
        nickname?: string | null;
        queue_ids?: number[];
        connection_ids?: number[];
        hide_name_active?: boolean;
    }): Promise<{
        ok: boolean;
    }>;
    isAllowedMimeType(mimeType: string): boolean;
    isWithinMaxSize(sizeBytes: number): boolean;
    saveAvatar(userId: string, file: {
        buffer: Buffer;
        originalName: string;
        mimeType: string;
    }): Promise<{
        avatar_url: string;
    }>;
};
//# sourceMappingURL=meu-perfil.service.d.ts.map