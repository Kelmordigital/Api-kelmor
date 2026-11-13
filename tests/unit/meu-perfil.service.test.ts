import { describe, it, expect, vi } from 'vitest';
import { MeuPerfilService } from '../../src/modules/meu-perfil/meu-perfil.service';
import type { AvatarData, MeuPerfilRepository, UserFieldsPatch } from '../../src/modules/meu-perfil/meu-perfil.repository';
import type { MediaStorage, StoredFile } from '../../src/core/storage/media-storage';
import { ForbiddenError, NotFoundError } from '../../src/core/errors/http-errors';

/** Regras do perfil próprio e troca segura de avatar, sem banco nem disco. */

function make(previousAvatar: string | null = null) {
    const events: string[] = [];
    const repo = {
        findProfile: vi.fn<MeuPerfilRepository['findProfile']>(async () => null),
        listOptions: vi.fn<MeuPerfilRepository['listOptions']>(async () => ({ queues: [], connections: [] })),
        updateUser: vi.fn(async (_id: string, _patch: UserFieldsPatch) => {}),
        replaceAssignments: vi.fn<MeuPerfilRepository['replaceAssignments']>(async () => {}),
        findAvatarUrl: vi.fn(async () => previousAvatar),
        saveAvatar: vi.fn(async (_id: string, avatar: AvatarData) => { events.push(`registra ${avatar.url}`); }),
    } satisfies MeuPerfilRepository;
    const storage: MediaStorage = {
        save: async () => { throw new Error('não usado'); },
        delete: vi.fn(async (p: string) => { events.push(`apaga ${p}`); }),
    };
    return { repo, storage, events, service: new MeuPerfilService(repo, storage) };
}

const file: StoredFile = { path: 'uploads/avatars/u1/novo.png', url: '/uploads/avatars/u1/novo.png', size: 10, mimeType: 'image/png', originalName: 'Eu.png' };

describe('MeuPerfilService.saveAvatar', () => {
    it('registra a nova foto antes de apagar a antiga', async () => {
        const { service, events } = make('/uploads/avatars/u1/antigo.png');
        expect(await service.saveAvatar('u1', file)).toEqual({ avatar_url: '/uploads/avatars/u1/novo.png' });
        expect(events).toEqual(['registra /uploads/avatars/u1/novo.png', 'apaga /uploads/avatars/u1/antigo.png']);
    });

    it('falha ao registrar: apaga a nova e mantém a antiga', async () => {
        const { service, repo, events } = make('/uploads/avatars/u1/antigo.png');
        repo.saveAvatar.mockRejectedValueOnce(new Error('db down'));
        await expect(service.saveAvatar('u1', file)).rejects.toThrow('db down');
        expect(events).toEqual(['apaga uploads/avatars/u1/novo.png']);
    });

    it('primeira foto: nada para apagar', async () => {
        const { service, events } = make(null);
        await service.saveAvatar('u1', file);
        expect(events).toEqual(['registra /uploads/avatars/u1/novo.png']);
    });
});

describe('MeuPerfilService.updateProfile', () => {
    it('quem não é admin não troca filas/conexões — e nada é gravado', async () => {
        const { service, repo } = make();
        await expect(service.updateProfile('u1', 'c1', { nickname: 'X', queue_ids: [1] })).rejects.toBeInstanceOf(ForbiddenError);
        expect(repo.updateUser).not.toHaveBeenCalled();
        expect(repo.replaceAssignments).not.toHaveBeenCalled();
    });

    it('admin troca; só o que foi enviado', async () => {
        const { service, repo } = make();
        await service.updateProfile('u1', 'c1', { connection_ids: [7] }, { canManageAssignments: true });
        expect(repo.replaceAssignments).toHaveBeenCalledWith('u1', 'c1', { queueIds: undefined, connectionIds: [7] });
    });

    it('apelido sem espaços; em branco vira null; sem filas não mexe nas associações', async () => {
        const { service, repo } = make();
        await service.updateProfile('u1', 'c1', { nickname: '  Fifi ' });
        await service.updateProfile('u1', 'c1', { nickname: '  ' });
        expect(repo.updateUser.mock.calls.map((c) => c[1])).toEqual([{ nickname: 'Fifi' }, { nickname: null }]);
        expect(repo.replaceAssignments).not.toHaveBeenCalled();
    });
});

describe('MeuPerfilService — leitura', () => {
    it('usuário inexistente → NotFoundError', async () => {
        await expect(make().service.getProfile('x')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('sem empresa → sem opções, sem consultar o banco', async () => {
        const { service, repo } = make();
        expect(await service.listSelects(null)).toEqual({ queues: [], connections: [] });
        expect(repo.listOptions).not.toHaveBeenCalled();
    });
});
