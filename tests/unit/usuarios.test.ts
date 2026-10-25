import { describe, it, expect, vi } from 'vitest';
import { UserAccountRules } from '../../src/modules/usuarios/user-account-rules';
import { UsuarioService } from '../../src/modules/usuarios/usuario.service';
import type { UserRepository } from '../../src/modules/usuarios/usuario.repository';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../src/core/errors/http-errors';

describe('UserAccountRules', () => {
    it('criação: normaliza e exige nome, e-mail e senha', () => {
        expect(UserAccountRules.forCreation({ name: ' Ana ', email: ' ANA@X.COM ', password: ' senha1234 ' }))
            .toEqual({ name: 'Ana', email: 'ana@x.com', password: 'senha1234' });
        expect(() => UserAccountRules.forCreation({ name: 'Ana', email: 'a@x.com' })).toThrow('Nome, e-mail e senha são obrigatórios');
        expect(() => UserAccountRules.forCreation({ name: 'Ana', email: 'a@x', password: 'senha1234' })).toThrow('E-mail inválido');
        expect(() => UserAccountRules.forCreation({ name: 'Ana', email: 'a@x.com', password: '1234567' })).toThrow('no mínimo 8');
    });

    it('edição: só o que veio; senha em branco não troca; nome em branco é recusado', () => {
        expect(UserAccountRules.forUpdate({ password: '   ' })).toEqual({});
        expect(UserAccountRules.forUpdate({ email: 'NOVO@X.COM' })).toEqual({ email: 'novo@x.com' });
        expect(() => UserAccountRules.forUpdate({ name: ' ' })).toThrow(BadRequestError);
    });
});

describe('UsuarioService', () => {
    const actor = { userId: 'admin', companyId: 'c1' };

    function make() {
        const repo = {
            findInCompany: vi.fn(async () => ({ id: 'u1', profile_id: 1 })),
            isEmailTaken: vi.fn(async () => false),
            profileById: vi.fn(async (id: number) => ({ 1: { id: 1, tag: 'user' }, 2: { id: 2, tag: 'admin' }, 3: { id: 3, tag: 'superAdmin' } } as Record<number, { id: number; tag: string }>)[id] ?? null),
            profileByTag: vi.fn(async () => ({ id: 1, tag: 'user' })),
            create: vi.fn(async () => ({ id: 'new' })),
            update: vi.fn(async () => {}),
            delete: vi.fn(async () => true),
            deleteRefreshTokens: vi.fn(async () => {}),
        } as unknown as UserRepository;
        const hasher = { hash: vi.fn(async (p: string) => `hash(${p})`), verify: vi.fn() };
        const sessions = { revoke: vi.fn(async () => {}) };
        const progress = { getCompanyProgress: vi.fn(async () => ({})) };
        return { repo, hasher, sessions, service: new UsuarioService(repo, hasher, sessions, progress) };
    }

    it('cria com hash da senha e perfil atendente por padrão', async () => {
        const { service, repo } = make();
        await service.create(actor, { name: 'Ana', email: 'ana@x.com', password: 'senha1234' });
        expect(repo.create).toHaveBeenCalledWith('c1',
            { name: 'Ana', email: 'ana@x.com', password_hash: 'hash(senha1234)', profile_id: 1 },
            { queueIds: [], connectionIds: [] });
    });

    it('superAdmin → 403; perfil inexistente → 400; e-mail usado → 409', async () => {
        const { service, repo } = make();
        await expect(service.create(actor, { name: 'A', email: 'a@x.com', password: 'senha1234', profile_id: 3 })).rejects.toBeInstanceOf(ForbiddenError);
        await expect(service.create(actor, { name: 'A', email: 'a@x.com', password: 'senha1234', profile_id: 9 })).rejects.toEqual(new BadRequestError('Perfil inválido'));
        vi.mocked(repo.isEmailTaken).mockResolvedValueOnce(true);
        await expect(service.create(actor, { name: 'A', email: 'a@x.com', password: 'senha1234' })).rejects.toBeInstanceOf(ConflictError);
    });

    it('troca de senha: novo hash, refresh tokens apagados e sessões derrubadas', async () => {
        const { service, repo, sessions } = make();
        await service.update(actor, 'u1', { password: 'novasenha1' });
        expect(repo.update).toHaveBeenCalledWith('u1', 'c1', { password_hash: 'hash(novasenha1)' }, { queueIds: undefined, connectionIds: undefined });
        expect(repo.deleteRefreshTokens).toHaveBeenCalledWith('u1');
        expect(sessions.revoke).toHaveBeenCalledWith('c1', 'u1');
    });

    it('troca de perfil derruba a sessão; mesmo perfil ou só nome, não', async () => {
        const changed = make();
        await changed.service.update(actor, 'u1', { profile_id: 2 });
        expect(changed.sessions.revoke).toHaveBeenCalledTimes(1);

        const same = make();
        await same.service.update(actor, 'u1', { profile_id: 1, name: 'Novo nome' });
        expect(same.sessions.revoke).not.toHaveBeenCalled();
        expect(same.repo.deleteRefreshTokens).not.toHaveBeenCalled();
    });

    it('usuário de outra empresa → 404 sem gravar', async () => {
        const { service, repo } = make();
        vi.mocked(repo.findInCompany).mockResolvedValueOnce(null);
        await expect(service.update(actor, 'x', { name: 'Y' })).rejects.toBeInstanceOf(NotFoundError);
        expect(repo.update).not.toHaveBeenCalled();
    });

    it('excluir: não a si mesmo; ao excluir outro, derruba a sessão dele', async () => {
        const { service, repo, sessions } = make();
        await expect(service.remove(actor, 'admin')).rejects.toBeInstanceOf(BadRequestError);
        expect(repo.delete).not.toHaveBeenCalled();
        await service.remove(actor, 'u1');
        expect(sessions.revoke).toHaveBeenCalledWith('c1', 'u1');
    });
});
