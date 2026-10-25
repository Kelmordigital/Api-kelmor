import { describe, it, expect } from 'vitest';
import { ProdutoService } from '../../src/modules/produtos/produto.service';
import type { ProdutoData, ProdutoPatch, ProdutoRepository } from '../../src/modules/produtos/produto.repository';
import type { Produto } from '../../src/modules/produtos/produto.db.schema';
import { NotFoundError } from '../../src/core/errors/http-errors';

/** Regras do ProdutoService isoladas do banco, via repositório em memória. */
class InMemoryProdutoRepository implements ProdutoRepository {
    rows: Produto[] = [];

    async listByCompany(companyId: string) { return this.rows.filter((r) => r.company_id === companyId); }
    async findById(id: string, companyId: string) {
        return this.rows.find((r) => r.id === id && r.company_id === companyId) ?? null;
    }
    async create(companyId: string, data: ProdutoData) {
        const row = { ...data, id: `p${this.rows.length + 1}`, company_id: companyId } as Produto;
        this.rows.push(row);
        return row;
    }
    async update(id: string, companyId: string, patch: ProdutoPatch) {
        const row = await this.findById(id, companyId);
        if (!row) return null;
        Object.assign(row, patch);
        return row;
    }
    async delete(id: string, companyId: string) {
        const before = this.rows.length;
        this.rows = this.rows.filter((r) => !(r.id === id && r.company_id === companyId));
        return this.rows.length < before;
    }
}

describe('ProdutoService', () => {
    const make = () => {
        const repo = new InMemoryProdutoRepository();
        return { repo, service: new ProdutoService(repo) };
    };

    it('create converte value para string e força is_active=true', async () => {
        const { service } = make();
        const p = await service.create('c1', { name: 'A', value_type: 'valor_unico', value: 10 });
        expect(p).toMatchObject({ value: '10', is_active: true, short_description: null });
    });

    it('sem_valor nunca guarda preço (create e update)', async () => {
        const { service } = make();
        const p = await service.create('c1', { name: 'A', value_type: 'sem_valor', value: 10 });
        expect(p.value).toBeNull();

        const q = await service.create('c1', { name: 'B', value_type: 'valor_unico', value: 5 });
        expect((await service.update(q.id, 'c1', { value_type: 'sem_valor', value: 7 })).value).toBeNull();
    });

    it('update sem value mantém o preço atual', async () => {
        const { service } = make();
        const p = await service.create('c1', { name: 'A', value_type: 'valor_unico', value: 10 });
        expect((await service.update(p.id, 'c1', { name: 'A2' })).value).toBe('10');
    });

    it('lança NotFoundError fora da empresa', async () => {
        const { service } = make();
        const p = await service.create('c1', { name: 'A', value_type: 'valor_unico' });
        await expect(service.findById(p.id, 'c2')).rejects.toBeInstanceOf(NotFoundError);
        await expect(service.update(p.id, 'c2', { name: 'X' })).rejects.toBeInstanceOf(NotFoundError);
        await expect(service.remove(p.id, 'c2')).rejects.toBeInstanceOf(NotFoundError);
    });
});
