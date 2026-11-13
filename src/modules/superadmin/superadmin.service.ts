import { BadRequestError, ConflictError, NotFoundError } from '../../core/errors/http-errors';
import type { PasswordHasher } from '../../core/auth/password-hasher';
import type { SessionRevoker } from '../../core/auth/session';
import { isUniqueViolation } from '../../core/database/pg-errors';
import type { AccountApproval } from '../auth/auth.service';
import type { CompanyDeactivationHandler } from '../companies/company-status';
import { CompanyPanel, type CompanyListItem, type MemberRecord } from './company-panel';
import type { SuperadminRepository } from './superadmin.repository';
import type { CreateCompanyInput, UpdateCompanyInput } from './superadmin.dto';

export interface PanelStats {
    total: number;
    ativas: number;
    inativas: number;
    pendentes: number;
}

/** Encerra na hora a sessão de todos os usuários da empresa desativada. */
export class CompanySessionsShutdown implements CompanyDeactivationHandler {
    readonly name = 'encerrar sessões';

    constructor(
        private readonly repository: Pick<SuperadminRepository, 'memberIds'>,
        private readonly sessions: SessionRevoker,
    ) {}

    async onDeactivated(companyId: string): Promise<void> {
        const ids = await this.repository.memberIds(companyId);
        await Promise.all(ids.map((userId) => this.sessions.revoke(companyId, userId)));
    }
}

/** Painel do dono do sistema: empresas, admins e aprovação de contas. */
export class SuperadminService {
    constructor(
        private readonly repository: SuperadminRepository,
        private readonly hasher: PasswordHasher,
        private readonly sessions: SessionRevoker,
        private readonly approval: AccountApproval,
        /** O que acontece quando uma empresa é desativada (RN-SUP-05). */
        private readonly onDeactivated: CompanyDeactivationHandler[] = [],
    ) {}

    async stats(): Promise<PanelStats> {
        const [statuses, pendentes] = await Promise.all([this.repository.companyStatuses(), this.repository.countPendingAdmins()]);
        const ativas = statuses.filter(Boolean).length;
        return { total: statuses.length, ativas, inativas: statuses.length - ativas, pendentes };
    }

    async listCompanies(): Promise<CompanyListItem[]> {
        const [list, members] = await Promise.all([this.repository.listCompanies(), this.repository.listMembers()]);
        const byCompany = new Map<string, MemberRecord[]>();
        for (const m of members) byCompany.set(m.company_id, [...(byCompany.get(m.company_id) ?? []), m]);
        return list.map((c) => CompanyPanel.row(c, byCompany.get(c.id) ?? []));
    }

    /** RN-SUP-04: empresa ativa + admin que nasce aguardando aprovação. */
    async createCompany(input: CreateCompanyInput) {
        if (await this.repository.isEmailTaken(input.admin.email)) throw new ConflictError('Email já cadastrado');

        try {
            const { company, admin } = await this.repository.createCompanyWithAdmin(
                { name: input.name, cnpj_cpf: input.cnpj_cpf ?? null },
                { name: input.admin.name, email: input.admin.email, password_hash: await this.hasher.hash(input.admin.password) },
            );
            const { password_hash: _hash, ...adminSafe } = admin;
            return { company, admin: adminSafe };
        } catch (err) {
            // Outro cadastro com o mesmo e-mail pode ter entrado entre a checagem e o insert
            if (isUniqueViolation(err)) throw new ConflictError('Email já cadastrado');
            throw err;
        }
    }

    async updateCompany(id: string, input: UpdateCompanyInput) {
        const company = await this.repository.updateCompany(id, input);
        if (!company) throw new NotFoundError('Empresa não encontrada');
        return company;
    }

    /**
     * RN-SUP-05: desativar dispara as reações (sessões, campanhas…). A empresa
     * fica desativada mesmo que uma reação falhe; a falha vai para o log.
     */
    async setCompanyStatus(id: string, status: boolean) {
        const company = await this.repository.setCompanyStatus(id, status);
        if (!company) throw new NotFoundError('Empresa não encontrada');
        if (!status) await this.runDeactivationHandlers(id);
        return company;
    }

    private async runDeactivationHandlers(companyId: string): Promise<void> {
        const results = await Promise.allSettled(this.onDeactivated.map((h) => h.onDeactivated(companyId)));
        results.forEach((result, i) => {
            if (result.status === 'rejected') {
                const reason = result.reason instanceof Error ? result.reason.message : result.reason;
                console.error(`[superadmin] Falha ao ${this.onDeactivated[i].name} da empresa ${companyId}:`, reason);
            }
        });
    }

    approveUser(userId: string) {
        return this.approval.approve(userId);
    }

    /** RN-SUP-06: revogar bloqueia o login e encerra a sessão aberta na hora. */
    async revokeUser(actorId: string, userId: string) {
        if (userId === actorId) throw new BadRequestError('O superAdmin não pode revogar a própria aprovação.');
        const revoked = await this.repository.revokeApproval(userId);
        if (!revoked) throw new NotFoundError('Usuário não encontrado');
        await this.sessions.revoke(revoked.company_id, revoked.id);
        const { company_id: _company, ...user } = revoked;
        return user;
    }
}
