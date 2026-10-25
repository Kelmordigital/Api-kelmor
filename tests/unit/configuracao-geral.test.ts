import { describe, it, expect, vi } from 'vitest';
import { getTableColumns } from 'drizzle-orm';
import { companyPermissions, type CompanyPermission } from '../../src/modules/configuracao-geral/configuracao-geral.db.schema';
import {
    BOOLEAN_PERMISSIONS, DECIMAL_PERMISSIONS, INTEGER_PERMISSIONS, OPTIONAL_ID_PERMISSIONS,
    updateConfiguracaoGeralSchema, updateInputFrom,
} from '../../src/modules/configuracao-geral/configuracao-geral.dto';
import { ConfiguracaoGeralService } from '../../src/modules/configuracao-geral/configuracao-geral.service';
import type {
    AutomaticMessages, ConfiguracaoGeralChanges, ConfiguracaoGeralRepository,
} from '../../src/modules/configuracao-geral/configuracao-geral.repository';
import { BadRequestError } from '../../src/core/errors/http-errors';

describe('colunas editáveis de company_permissions', () => {
    it('toda coluna nova precisa ser classificada (editável por tipo, ou fora de propósito)', () => {
        const notEditable = ['id', 'company_id', 'created_at', 'updated_at'];
        const classified = [
            ...BOOLEAN_PERMISSIONS, ...Object.keys(INTEGER_PERMISSIONS), ...DECIMAL_PERMISSIONS, ...OPTIONAL_ID_PERMISSIONS,
        ];
        const columns = Object.keys(getTableColumns(companyPermissions)).filter((c) => !notEditable.includes(c));
        expect(classified.sort()).toEqual(columns.sort());
    });
});

describe('updateInputFrom', () => {
    it('separa mensagens, e-mails e permissões; descarta campos fora do contrato', () => {
        const body = updateConfiguracaoGeralSchema.parse({
            init_message: '<p>Oi</p>', notify_emails: ['a@b.com'], spy_ticket: true, sale_xp_amount: 3,
            id: 9, company_id: 'x', created_at: 'ontem', inventado: 1,
        });
        expect(updateInputFrom(body)).toEqual({
            init_message: '<p>Oi</p>', end_message: undefined, transfer_message: undefined,
            notify_emails: ['a@b.com'], permissions: { spy_ticket: true, sale_xp_amount: 3 },
        });
    });
});

class FakeRepo implements ConfiguracaoGeralRepository {
    saved: ConfiguracaoGeralChanges[] = [];
    perms = { id: 1, company_id: 'c1', spy_ticket: false } as CompanyPermission;

    async findOrCreatePermissions() { return { ...this.perms }; }
    async findMessages(): Promise<AutomaticMessages> { return { init_message: null, end_message: null, transfer_message: null }; }
    async listNotifyEmails() { return []; }
    async save(_companyId: string, changes: ConfiguracaoGeralChanges) { this.saved.push(changes); }
}

function make() {
    const repo = new FakeRepo();
    const notifier = { permissionsChanged: vi.fn() };
    return { repo, notifier, service: new ConfiguracaoGeralService(repo, notifier) };
}

describe('ConfiguracaoGeralService.update', () => {
    it('mensagem só com tags vira null; com texto fica como veio; ausente não entra', async () => {
        const { service, repo } = make();
        await service.update('c1', { init_message: '<p><br></p>', end_message: '<b>Até</b>', permissions: {} });
        expect(repo.saved[0].messages).toEqual({ init_message: null, end_message: '<b>Até</b>' });
    });

    it('e-mails: trim, minúsculas, sem vazios nem repetidos', async () => {
        const { service, repo } = make();
        await service.update('c1', { notify_emails: [' Dono@Empresa.com', 'dono@empresa.com ', ''], permissions: {} });
        expect(repo.saved[0].notifyEmails).toEqual(['dono@empresa.com']);
    });

    it('e-mail malformado: recusa sem gravar nem avisar', async () => {
        const { service, repo, notifier } = make();
        await expect(service.update('c1', { notify_emails: ['ok@a.com', 'ruim@'], permissions: { spy_ticket: true } }))
            .rejects.toEqual(new BadRequestError('E-mail inválido: ruim@'));
        expect(repo.saved).toHaveLength(0);
        expect(notifier.permissionsChanged).not.toHaveBeenCalled();
    });

    it('e-mails ausentes não mexem na lista', async () => {
        const { service, repo } = make();
        await service.update('c1', { permissions: { spy_ticket: true } });
        expect(repo.saved[0].notifyEmails).toBeUndefined();
    });

    it('depois de gravar, avisa o front em tempo real', async () => {
        const { service, notifier } = make();
        await service.update('c1', { permissions: { spy_ticket: true } });
        expect(notifier.permissionsChanged).toHaveBeenCalledWith('c1');
    });
});
