import { describe, it, expect, vi } from 'vitest';
import { CompanyPanel, type MemberRecord } from '../../src/modules/superadmin/company-panel';
import { CompanySessionsShutdown, SuperadminService } from '../../src/modules/superadmin/superadmin.service';
import { ActiveCampaignsPauser } from '../../src/modules/campanhas/active-campaigns-pauser';
import type { CampaignsGateway } from '../../src/modules/campanhas/campaigns.gateway';
import type { CompanyDeactivationHandler } from '../../src/modules/companies/company-status';
import type { SuperadminRepository } from '../../src/modules/superadmin/superadmin.repository';
import { BadRequestError, ConflictError, NotFoundError } from '../../src/core/errors/http-errors';

const member = (over: Partial<MemberRecord>): MemberRecord => ({
    id: 'u', name: 'N', email: 'n@x.com', is_approved: true, company_id: 'c1',
    created_at: new Date('2026-01-01'), profile_tag: 'user', ...over,
});

describe('CompanyPanel', () => {
    const company = { id: 'c1', name: 'Loja', cnpj_cpf: null, status: true, created_at: null };

    it('situação: INATIVA vence; PENDENTE com admin não aprovado; senão ATIVA', () => {
        const admin = { id: 'a', name: 'A', email: 'a@x.com', is_approved: false };
        expect(CompanyPanel.situacao(false, admin)).toBe('INATIVA');
        expect(CompanyPanel.situacao(true, admin)).toBe('PENDENTE');
        expect(CompanyPanel.situacao(true, { ...admin, is_approved: true })).toBe('ATIVA');
        expect(CompanyPanel.situacao(true, null)).toBe('ATIVA');
    });

    it('admin principal é o admin mais antigo (empate pelo id); equipe com admins primeiro', () => {
        const row = CompanyPanel.row(company, [
            member({ id: 'u1', created_at: new Date('2025-01-01') }),
            member({ id: 'b', profile_tag: 'admin', created_at: new Date('2026-01-01') }),
            member({ id: 'a', profile_tag: 'admin', created_at: new Date('2026-01-01') }),
        ]);
        expect(row.admin?.id).toBe('a');
        expect(row.users.map((u) => u.id)).toEqual(['a', 'b', 'u1']);
        expect(row.users_count).toBe(3);
    });

    it('empresa sem ninguém: sem admin e ATIVA', () => {
        expect(CompanyPanel.row(company, [])).toMatchObject({ admin: null, users: [], users_count: 0, situacao: 'ATIVA' });
    });
});

function make(over: Partial<SuperadminRepository> = {}, handlers: CompanyDeactivationHandler[] = []) {
    const repo = {
        isEmailTaken: vi.fn(async () => false),
        createCompanyWithAdmin: vi.fn(async (c, a) => ({ company: { id: 'c1', ...c }, admin: { id: 'a1', ...a } })),
        setCompanyStatus: vi.fn(async (id: string, status: boolean) => ({ id, status })),
        memberIds: vi.fn(async () => ['u1', 'u2']),
        revokeApproval: vi.fn(async (id: string) => ({ id, name: 'N', email: 'n@x.com', is_approved: false, company_id: 'c1' })),
        ...over,
    } as unknown as SuperadminRepository;
    const sessions = { revoke: vi.fn(async () => {}) };
    const hasher = { hash: vi.fn(async (p: string) => `hash:${p}`), verify: vi.fn() };
    const service = new SuperadminService(repo, hasher, sessions, { approve: vi.fn() }, handlers);
    return { repo, sessions, service };
}

const input = { name: 'Loja', admin: { name: 'Ana', email: 'ana@x.com', password: 'senha12345' } };

describe('SuperadminService', () => {
    it('criar empresa: guarda o hash e nunca devolve password_hash', async () => {
        const { service, repo } = make();
        const result = await service.createCompany(input);
        expect(repo.createCompanyWithAdmin).toHaveBeenCalledWith(
            { name: 'Loja', cnpj_cpf: null }, { name: 'Ana', email: 'ana@x.com', password_hash: 'hash:senha12345' },
        );
        expect(result.admin).not.toHaveProperty('password_hash');
    });

    it('e-mail já usado → 409, inclusive quando outro cadastro entra no meio (índice único)', async () => {
        await expect(make({ isEmailTaken: vi.fn(async () => true) }).service.createCompany(input))
            .rejects.toEqual(new ConflictError('Email já cadastrado'));

        const race = Object.assign(new Error('insert'), { cause: { code: '23505' } });
        await expect(make({ createCompanyWithAdmin: vi.fn(async () => { throw race; }) }).service.createCompany(input))
            .rejects.toEqual(new ConflictError('Email já cadastrado'));
    });

    it('desativar roda todas as reações; reativar não roda nenhuma', async () => {
        const handler = () => ({ name: 'x', onDeactivated: vi.fn(async () => {}) });
        const [a, b] = [handler(), handler()];
        await make({}, [a, b]).service.setCompanyStatus('c1', false);
        expect(a.onDeactivated).toHaveBeenCalledWith('c1');
        expect(b.onDeactivated).toHaveBeenCalledWith('c1');

        const c = handler();
        await make({}, [c]).service.setCompanyStatus('c1', true);
        expect(c.onDeactivated).not.toHaveBeenCalled();
    });

    it('uma reação que falha não impede as outras nem a desativação', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const broken = { name: 'pausar campanhas', onDeactivated: vi.fn(async () => { throw new Error('serviço fora'); }) };
        const ok = { name: 'encerrar sessões', onDeactivated: vi.fn(async () => {}) };
        expect(await make({}, [broken, ok]).service.setCompanyStatus('c1', false)).toEqual({ id: 'c1', status: false });
        expect(ok.onDeactivated).toHaveBeenCalled();
        expect(error).toHaveBeenCalledWith(expect.stringContaining('pausar campanhas'), 'serviço fora');
        error.mockRestore();
    });

    it('CompanySessionsShutdown encerra a sessão de cada usuário da empresa', async () => {
        const sessions = { revoke: vi.fn(async () => {}) };
        await new CompanySessionsShutdown({ memberIds: async () => ['u1', 'u2'] }, sessions).onDeactivated('c1');
        expect(sessions.revoke.mock.calls).toEqual([['c1', 'u1'], ['c1', 'u2']]);
    });

    it('ActiveCampaignsPauser pausa só as campanhas agendadas/disparando que não estão pausadas', async () => {
        const gateway = {
            list: vi.fn(async () => [
                { id: 1, is_running: true,  is_sending: false, is_paused: false },
                { id: 2, is_running: false, is_sending: true,  is_paused: false },
                { id: 3, is_running: true,  is_sending: false, is_paused: true },
                { id: 4, is_running: false, is_sending: false, is_paused: false },
            ]),
            pause: vi.fn(async () => {}),
        } as unknown as CampaignsGateway;
        await new ActiveCampaignsPauser(gateway).onDeactivated('c1');
        expect((gateway.pause as ReturnType<typeof vi.fn>).mock.calls).toEqual([[1, 'c1'], [2, 'c1']]);
    });

    it('empresa inexistente → 404', async () => {
        await expect(make({ setCompanyStatus: vi.fn(async () => null) }).service.setCompanyStatus('x', false))
            .rejects.toEqual(new NotFoundError('Empresa não encontrada'));
    });

    it('revogar: não pode a si mesmo; encerra a sessão; não expõe company_id', async () => {
        const { service, sessions, repo } = make();
        await expect(service.revokeUser('me', 'me')).rejects.toEqual(new BadRequestError('O superAdmin não pode revogar a própria aprovação.'));
        expect(repo.revokeApproval).not.toHaveBeenCalled();

        expect(await service.revokeUser('me', 'u1')).toEqual({ id: 'u1', name: 'N', email: 'n@x.com', is_approved: false });
        expect(sessions.revoke).toHaveBeenCalledWith('c1', 'u1');

        await expect(make({ revokeApproval: vi.fn(async () => null) }).service.revokeUser('me', 'x'))
            .rejects.toEqual(new NotFoundError('Usuário não encontrado'));
    });
});
