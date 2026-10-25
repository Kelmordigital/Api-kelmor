import type { DB } from '../../database/client';
import { users } from '../auth/auth.schema';
export declare const EMAIL_TAKEN_MESSAGE = "E-mail j\u00E1 cadastrado";
export interface CompanyUser {
    id: string;
    name: string;
    nickname: string | null;
    email: string;
    profile_id: number;
    profile_tag: string;
    profile_name: string;
    is_approved: boolean;
    created_at: Date | null;
    avatar_url: string | null;
    queue_ids: number[];
    connection_ids: number[];
}
/** Usuário como pode sair na API: sem hash de senha nem segredos de 2FA. */
export type PublicUser = Omit<typeof users.$inferSelect, 'password_hash' | 'totp_secret' | 'totp_recovery_codes'>;
export interface NewUserData {
    name: string;
    email: string;
    password_hash: string;
    profile_id: number;
}
export interface UserPatch {
    name?: string;
    email?: string;
    password_hash?: string;
    profile_id?: number;
}
export interface Assignments {
    queueIds?: number[];
    connectionIds?: number[];
}
export interface UserRepository {
    listByCompany(companyId: string): Promise<CompanyUser[]>;
    findInCompany(id: string, companyId: string): Promise<{
        id: string;
        profile_id: number;
    } | null>;
    isEmailTaken(email: string, exceptUserId?: string): Promise<boolean>;
    profileById(id: number): Promise<{
        id: number;
        tag: string;
    } | null>;
    profileByTag(tag: string): Promise<{
        id: number;
        tag: string;
    } | null>;
    /** Cria o usuário (aprovado) e as filas/conexões dele numa transação. Lança ConflictError para e-mail repetido. */
    create(companyId: string, data: NewUserData, assignments: Assignments): Promise<PublicUser & {
        queue_ids: number[];
        connection_ids: number[];
    }>;
    /** Altera dados e substitui filas/conexões enviadas numa transação. Lança ConflictError para e-mail repetido. */
    update(id: string, companyId: string, patch: UserPatch, assignments: Assignments): Promise<void>;
    delete(id: string, companyId: string): Promise<boolean>;
    deleteRefreshTokens(userId: string): Promise<void>;
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
}
export declare class DrizzleUserRepository implements UserRepository {
    private readonly db;
    constructor(db: DB);
    listByCompany(companyId: string): Promise<CompanyUser[]>;
    findInCompany(id: string, companyId: string): Promise<{
        id: string;
        profile_id: number;
    }>;
    isEmailTaken(email: string, exceptUserId?: string): Promise<boolean>;
    profileById(id: number): Promise<{
        id: number;
        tag: string;
    }>;
    profileByTag(tag: string): Promise<{
        id: number;
        tag: string;
    }>;
    create(companyId: string, data: NewUserData, assignments: Assignments): Promise<{
        queue_ids: number[];
        connection_ids: number[];
        id: string;
        name: string;
        created_at: Date | null;
        updated_at: Date | null;
        nickname: string | null;
        email: string;
        profile_id: number;
        company_id: string | null;
        email_verified: boolean;
        is_approved: boolean;
        finance: boolean;
        totp_enabled: boolean;
        xp: number;
        hide_name_active: boolean;
    }>;
    update(id: string, companyId: string, patch: UserPatch, assignments: Assignments): Promise<void>;
    delete(id: string, companyId: string): Promise<boolean>;
    deleteRefreshTokens(userId: string): Promise<void>;
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
    /**
     * Substitui as associações enviadas, só com filas/conexões da empresa —
     * sem esse filtro dava para vincular fila/conexão de outra empresa a um usuário.
     */
    private replaceAssignments;
    /** Duas gravações simultâneas com o mesmo e-mail: o índice único decide. */
    private uniqueEmail;
}
//# sourceMappingURL=usuario.repository.d.ts.map