"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsuarioService = void 0;
const http_errors_1 = require("../../core/errors/http-errors");
const usuario_repository_1 = require("./usuario.repository");
const user_account_rules_1 = require("./user-account-rules");
const DEFAULT_PROFILE_TAG = 'user';
const SUPER_ADMIN_TAG = 'superAdmin';
/**
 * Gestão dos usuários da empresa pelo admin. Mudanças que afetam o acesso
 * (senha, perfil, exclusão) derrubam as sessões abertas do usuário.
 */
class UsuarioService {
    repository;
    hasher;
    sessions;
    progress;
    constructor(repository, hasher, sessions, progress) {
        this.repository = repository;
        this.hasher = hasher;
        this.sessions = sessions;
        this.progress = progress;
    }
    async list(companyId) {
        const list = await this.repository.listByCompany(companyId);
        if (list.length === 0)
            return [];
        const progress = await this.progress.getCompanyProgress(companyId, list.map((u) => u.id));
        return list.map((u) => ({
            ...u,
            patente: progress[u.id]?.patente ?? 'Aprendiz',
            patente_sub_level: progress[u.id]?.sub_level ?? null,
        }));
    }
    async options(companyId) {
        const [queues, connections] = await Promise.all([
            this.repository.listQueues(companyId),
            this.repository.listConnections(companyId),
        ]);
        return { queues, connections };
    }
    async create(actor, input) {
        const profileId = await this.allowedProfileId(input.profile_id, 'Não é permitido criar superAdmin');
        const account = user_account_rules_1.UserAccountRules.forCreation(input);
        if (await this.repository.isEmailTaken(account.email))
            throw new http_errors_1.ConflictError(usuario_repository_1.EMAIL_TAKEN_MESSAGE);
        return this.repository.create(actor.companyId, {
            name: account.name,
            email: account.email,
            password_hash: await this.hasher.hash(account.password),
            profile_id: profileId,
        }, { queueIds: input.queue_ids ?? [], connectionIds: input.connection_ids ?? [] });
    }
    async update(actor, id, input) {
        const profileId = input.profile_id === undefined
            ? undefined
            : await this.allowedProfileId(input.profile_id, 'Não é permitido definir superAdmin');
        const target = await this.repository.findInCompany(id, actor.companyId);
        if (!target)
            throw UsuarioService.notFound();
        const changes = user_account_rules_1.UserAccountRules.forUpdate(input);
        if (changes.email && await this.repository.isEmailTaken(changes.email, id))
            throw new http_errors_1.ConflictError(usuario_repository_1.EMAIL_TAKEN_MESSAGE);
        const patch = {};
        if (changes.name)
            patch.name = changes.name;
        if (changes.email)
            patch.email = changes.email;
        if (changes.password)
            patch.password_hash = await this.hasher.hash(changes.password);
        if (profileId !== undefined)
            patch.profile_id = profileId;
        await this.repository.update(id, actor.companyId, patch, { queueIds: input.queue_ids, connectionIds: input.connection_ids });
        // Senha nova: quem tinha a antiga não continua logado. Perfil novo: o
        // token atual carrega o perfil antigo, então é preciso entrar de novo.
        const profileChanged = profileId !== undefined && profileId !== target.profile_id;
        if (changes.password)
            await this.repository.deleteRefreshTokens(id);
        if (changes.password || profileChanged)
            await this.sessions.revoke(actor.companyId, id);
    }
    async remove(actor, id) {
        if (id === actor.userId)
            throw new http_errors_1.BadRequestError('Você não pode excluir seu próprio usuário');
        if (!(await this.repository.delete(id, actor.companyId)))
            throw UsuarioService.notFound();
        await this.sessions.revoke(actor.companyId, id);
    }
    /** Perfil existente e que não seja superAdmin; sem perfil, atendente. */
    async allowedProfileId(profileId, superAdminMessage) {
        const profile = profileId === undefined
            ? await this.repository.profileByTag(DEFAULT_PROFILE_TAG)
            : await this.repository.profileById(profileId);
        if (!profile)
            throw new http_errors_1.BadRequestError('Perfil inválido');
        if (profile.tag === SUPER_ADMIN_TAG)
            throw new http_errors_1.ForbiddenError(superAdminMessage);
        return profile.id;
    }
    static notFound() {
        return new http_errors_1.NotFoundError('Usuário não encontrado');
    }
}
exports.UsuarioService = UsuarioService;
//# sourceMappingURL=usuario.service.js.map