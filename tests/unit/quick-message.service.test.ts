import { describe, it, expect } from 'vitest';
import type { Readable } from 'stream';
import { QuickMessageService } from '../../src/modules/quick-messages/quick-messages.service';
import type {
    QuickMessageData, QuickMessagePatch, QuickMessageQuery, QuickMessageRepository,
} from '../../src/modules/quick-messages/quick-messages.repository';
import type { QuickMessage } from '../../src/modules/quick-messages/quick-messages.db.schema';
import type { MediaStorage, StoredFile } from '../../src/core/storage/media-storage';
import { Pagination } from '../../src/core/http/pagination';
import { BadRequestError, NotFoundError } from '../../src/core/errors/http-errors';

/** Regras de mensagens rápidas e ciclo de vida dos arquivos, sem banco nem disco. */

class InMemoryRepo implements QuickMessageRepository {
    rows: QuickMessage[] = [];
    private seq = 0;

    async page(companyId: string, { limit, offset }: QuickMessageQuery) {
        const all = this.rows.filter((r) => r.company_id === companyId);
        return { rows: all.slice(offset, offset + limit), total: all.length };
    }
    /** Cópia, como o banco: quem lê não enxerga escritas posteriores. */
    async findById(id: number, companyId: string) {
        const row = this.find(id, companyId);
        return row ? { ...row } : null;
    }
    private find(id: number, companyId: string) {
        return this.rows.find((r) => r.id === id && r.company_id === companyId);
    }
    async create(companyId: string, data: QuickMessageData) {
        const row = { media_path: null, media_type: null, media_size: null, message: null, ...data, id: ++this.seq, company_id: companyId } as QuickMessage;
        this.rows.push(row);
        return row;
    }
    async update(id: number, companyId: string, patch: QuickMessagePatch) {
        const row = this.find(id, companyId);
        if (!row) return null;
        Object.assign(row, patch);
        return { ...row };
    }
    async delete(id: number, companyId: string) {
        const before = this.rows.length;
        this.rows = this.rows.filter((r) => !(r.id === id && r.company_id === companyId));
        return this.rows.length < before;
    }
}

class FakeStorage implements MediaStorage {
    deleted: string[] = [];
    async save(_folder: string, _name: string, _mime: string, _content: Readable): Promise<StoredFile> {
        throw new Error('não usado: o arquivo chega já gravado');
    }
    async delete(filePath: string) { this.deleted.push(filePath); }
}

const file = (name: string): StoredFile => ({ path: `uploads/qm/${name}`, url: `/uploads/qm/${name}`, size: 3, mimeType: 'image/png', originalName: name });

function make() {
    const repo = new InMemoryRepo();
    const storage = new FakeStorage();
    return { repo, storage, service: new QuickMessageService(repo, storage) };
}

describe('QuickMessageService', () => {
    it('falha de validação na criação apaga o arquivo enviado', async () => {
        const { service, storage } = make();
        await expect(service.create('c1', { removeMedia: false }, file('a.png'))).rejects.toBeInstanceOf(BadRequestError);
        expect(storage.deleted).toEqual(['uploads/qm/a.png']);
    });

    it('404 na edição apaga o arquivo enviado', async () => {
        const { service, storage } = make();
        await expect(service.update(99, 'c1', { removeMedia: false }, file('a.png'))).rejects.toBeInstanceOf(NotFoundError);
        expect(storage.deleted).toEqual(['uploads/qm/a.png']);
    });

    it('trocar o arquivo apaga o antigo só depois de gravar', async () => {
        const { service, storage } = make();
        const qm = await service.create('c1', { title: 'T', removeMedia: false }, file('old.png'));
        const updated = await service.update(qm.id, 'c1', { removeMedia: false }, file('new.png'));
        expect(updated.media_path).toBe('uploads/qm/new.png');
        expect(storage.deleted).toEqual(['uploads/qm/old.png']);
    });

    it('editar sem mexer na mídia não apaga nada', async () => {
        const { service, storage } = make();
        const qm = await service.create('c1', { title: 'T', removeMedia: false }, file('a.png'));
        await service.update(qm.id, 'c1', { title: 'T2', removeMedia: false });
        expect(storage.deleted).toEqual([]);
    });

    it('não deixa a mensagem ficar vazia removendo a mídia nem o texto', async () => {
        const { service, storage } = make();
        const qm = await service.create('c1', { title: 'T', message: 'oi', removeMedia: false }, file('a.png'));
        await expect(service.update(qm.id, 'c1', { message: ' ', removeMedia: true })).rejects.toThrow('É obrigatório ter mensagem');
        expect(storage.deleted).toEqual([]);
        // tirar só um dos dois é permitido
        expect((await service.update(qm.id, 'c1', { removeMedia: true })).media_path).toBeNull();
        expect(storage.deleted).toEqual(['uploads/qm/a.png']);
    });

    it('remover apaga o registro e depois o arquivo', async () => {
        const { service, storage, repo } = make();
        const qm = await service.create('c1', { title: 'T', removeMedia: false }, file('a.png'));
        await service.remove(qm.id, 'c1');
        expect(repo.rows).toHaveLength(0);
        expect(storage.deleted).toEqual(['uploads/qm/a.png']);
        await expect(service.remove(qm.id, 'c1')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('list devolve a página no formato do front', async () => {
        const { service } = make();
        for (let i = 0; i < 3; i++) await service.create('c1', { title: `T${i}`, message: 'm', removeMedia: false });
        const page = await service.list('c1', Pagination.fromQuery({ page: '2', limit: '2' }, { defaultLimit: 10, maxLimit: 50 }));
        expect(page).toMatchObject({ total: 3, page: 2, limit: 2, totalPages: 2 });
        expect(page.data.map((m) => m.title)).toEqual(['T2']);
    });
});
