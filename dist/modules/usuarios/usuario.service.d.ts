import type { PasswordHasher } from '../../core/auth/password-hasher';
import type { SessionRevoker } from '../../core/auth/session';
import type { AchievementProgressReader } from '../achievements/achievements.service';
import { type CompanyUser, type UserRepository } from './usuario.repository';
import type { UserInput } from './usuario.dto';
export interface Actor {
    userId: string;
    companyId: string;
}
/**
 * Gestão dos usuários da empresa pelo admin. Mudanças que afetam o acesso
 * (senha, perfil, exclusão) derrubam as sessões abertas do usuário.
 */
export declare class UsuarioService {
    private readonly repository;
    private readonly hasher;
    private readonly sessions;
    private readonly progress;
    constructor(repository: UserRepository, hasher: PasswordHasher, sessions: SessionRevoker, progress: AchievementProgressReader);
    list(companyId: string): Promise<(CompanyUser & {
        patente: string;
        patente_sub_level: number | null;
    })[]>;
    options(companyId: string): Promise<{
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
    create(actor: Actor, input: UserInput): Promise<import("./usuario.repository").PublicUser & {
        queue_ids: number[];
        connection_ids: number[];
    }>;
    update(actor: Actor, id: string, input: UserInput): Promise<void>;
    remove(actor: Actor, id: string): Promise<void>;
    /** Perfil existente e que não seja superAdmin; sem perfil, atendente. */
    private allowedProfileId;
    private static notFound;
}
//# sourceMappingURL=usuario.service.d.ts.map