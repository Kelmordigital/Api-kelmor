export declare const usuarioService: {
    list(companyId: string): Promise<{
        queue_ids: number[];
        connection_ids: number[];
        id: string;
        name: string;
        email: string;
        profile_id: number;
        profile_tag: string;
        profile_name: string;
        is_approved: boolean;
        created_at: Date | null;
    }[]>;
    create(companyId: string, payload: {
        name: string;
        email: string;
        password: string;
        profile_id: number;
        queue_ids?: number[];
        connection_ids?: number[];
    }): Promise<{
        queue_ids: number[];
        connection_ids: number[];
        id: string;
        name: string;
        created_at: Date | null;
        updated_at: Date | null;
        email: string;
        password_hash: string;
        profile_id: number;
        company_id: string | null;
        email_verified: boolean;
        is_approved: boolean;
        finance: boolean;
        totp_secret: string | null;
        totp_enabled: boolean;
        totp_recovery_codes: unknown;
    }>;
    update(id: string, companyId: string, payload: {
        name?: string;
        email?: string;
        password?: string;
        profile_id?: number;
        queue_ids?: number[];
        connection_ids?: number[];
    }): Promise<{
        id: string;
    }>;
    remove(id: string, companyId: string): Promise<boolean>;
    listQueues(companyId: string): Promise<{
        id: number;
        name: string;
        color: string | null;
    }[]>;
    listConnections(companyId: string): Promise<{
        id: number;
        name: string;
        status: string | null;
    }[]>;
};
//# sourceMappingURL=usuario.service.d.ts.map