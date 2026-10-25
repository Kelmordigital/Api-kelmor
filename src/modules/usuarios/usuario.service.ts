import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../core/errors/http-errors';
import type { PasswordHasher } from '../../core/auth/password-hasher';
import type { SessionRevoker } from '../../core/auth/session';
import type { AchievementProgressReader } from '../achievements/achievements.service';
import { EMAIL_TAKEN_MESSAGE, type CompanyUser, type UserPatch, type UserRepository } from './usuario.repository';
import { UserAccountRules } from './user-account-rules';
import type { UserInput } from './usuario.dto';

const DEFAULT_PROFILE_TAG = 'user';
const SUPER_ADMIN_TAG = 'superAdmin';

export interface Actor {
    userId: string;
    companyId: string;
}

/**
 * Gestão dos usuários da empresa pelo admin. Mudanças que afetam o acesso
 * (senha, perfil, exclusão) derrubam as sessões abertas do usuário.
 */
export class UsuarioService {
    constructor(
        private readonly repository: UserRepository,
        private readonly hasher: PasswordHasher,
        private readonly sessions: SessionRevoker,
        private readonly progress: AchievementProgressReader,
    ) {}

    async list(companyId: string): Promise<(CompanyUser & { patente: string; patente_sub_level: number | null })[]> {
        const list = await this.repository.listByCompany(companyId);
        if (list.length === 0) return [];
        const progress = await this.progress.getCompanyProgress(companyId, list.map((u) => u.id));
        return list.map((u) => ({
            ...u,
            patente: progress[u.id]?.patente ?? 'Aprendiz',
            patente_sub_level: progress[u.id]?.sub_level ?? null,
        }));
    }

    async options(companyId: string) {
        const [queues, connections] = await Promise.all([
            this.repository.listQueues(companyId),
            this.repository.listConnections(companyId),
        ]);
        return { queues, connections };
    }

    async create(actor: Actor, input: UserInput) {
        const profileId = await this.allowedProfileId(input.profile_id, 'Não é permitido criar superAdmin');
        const account = UserAccountRules.forCreation(input);
        if (await this.repository.isEmailTaken(account.email)) throw new ConflictError(EMAIL_TAKEN_MESSAGE);

        return this.repository.create(actor.companyId, {
            name: account.name,
            email: account.email,
            password_hash: await this.hasher.hash(account.password),
            profile_id: profileId,
        }, { queueIds: input.queue_ids ?? [], connectionIds: input.connection_ids ?? [] });
    }

    async update(actor: Actor, id: string, input: UserInput): Promise<void> {
        const profileId = input.profile_id === undefined
            ? undefined
            : await this.allowedProfileId(input.profile_id, 'Não é permitido definir superAdmin');
        const target = await this.repository.findInCompany(id, actor.companyId);
        if (!target) throw UsuarioService.notFound();

        const changes = UserAccountRules.forUpdate(input);
        if (changes.email && await this.repository.isEmailTaken(changes.email, id)) throw new ConflictError(EMAIL_TAKEN_MESSAGE);

        const patch: UserPatch = {};
        if (changes.name) patch.name = changes.name;
        if (changes.email) patch.email = changes.email;
        if (changes.password) patch.password_hash = await this.hasher.hash(changes.password);
        if (profileId !== undefined) patch.profile_id = profileId;

        await this.repository.update(id, actor.companyId, patch, { queueIds: input.queue_ids, connectionIds: input.connection_ids });

        // Senha nova: quem tinha a antiga não continua logado. Perfil novo: o
        // token atual carrega o perfil antigo, então é preciso entrar de novo.
        const profileChanged = profileId !== undefined && profileId !== target.profile_id;
        if (changes.password) await this.repository.deleteRefreshTokens(id);
        if (changes.password || profileChanged) await this.sessions.revoke(actor.companyId, id);
    }

    async remove(actor: Actor, id: string): Promise<void> {
        if (id === actor.userId) throw new BadRequestError('Você não pode excluir seu próprio usuário');
        if (!(await this.repository.delete(id, actor.companyId))) throw UsuarioService.notFound();
        await this.sessions.revoke(actor.companyId, id);
    }

    /** Perfil existente e que não seja superAdmin; sem perfil, atendente. */
    private async allowedProfileId(profileId: number | undefined, superAdminMessage: string): Promise<number> {
        const profile = profileId === undefined
            ? await this.repository.profileByTag(DEFAULT_PROFILE_TAG)
            : await this.repository.profileById(profileId);
        if (!profile) throw new BadRequestError('Perfil inválido');
        if (profile.tag === SUPER_ADMIN_TAG) throw new ForbiddenError(superAdminMessage);
        return profile.id;
    }

    private static notFound() {
        return new NotFoundError('Usuário não encontrado');
    }
}
