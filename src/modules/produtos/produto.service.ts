import { NotFoundError } from '../../core/errors/http-errors';
import type { Produto } from './produto.db.schema';
import type { ProdutoPatch, ProdutoRepository } from './produto.repository';
import type { CreateProdutoInput, UpdateProdutoInput, ValueType } from './produto.dto';

/**
 * Leitura do catálogo — tudo o que outros módulos (ex.: atendimento)
 * precisam de produtos. Eles dependem só desta interface (ISP/DIP).
 */
export interface ProdutoCatalog {
    list(companyId: string): Promise<Produto[]>;
}

export class ProdutoService implements ProdutoCatalog {
    constructor(private readonly repository: ProdutoRepository) {}

    list(companyId: string): Promise<Produto[]> {
        return this.repository.listByCompany(companyId);
    }

    async findById(id: string, companyId: string): Promise<Produto> {
        return this.orNotFound(await this.repository.findById(id, companyId));
    }

    create(companyId: string, input: CreateProdutoInput): Promise<Produto> {
        return this.repository.create(companyId, {
            name:               input.name,
            short_description:  input.short_description ?? null,
            value_type:         input.value_type,
            value:              ProdutoService.priceFor(input.value_type, input.value),
            delivery_timeframe: input.delivery_timeframe ?? null,
            how_it_works:       input.how_it_works ?? null,
            full_description:   input.full_description ?? null,
            is_active:          true,
        });
    }

    async update(id: string, companyId: string, input: UpdateProdutoInput): Promise<Produto> {
        const { value, ...rest } = input;
        const patch: ProdutoPatch = { ...rest };
        if (value !== undefined) patch.value = ProdutoService.priceFor(input.value_type, value);
        if (input.value_type === 'sem_valor') patch.value = null;
        return this.orNotFound(await this.repository.update(id, companyId, patch));
    }

    async remove(id: string, companyId: string): Promise<void> {
        if (!(await this.repository.delete(id, companyId))) throw ProdutoService.notFound();
    }

    /** Produto "sem_valor" nunca tem preço; o numeric do banco recebe string. */
    private static priceFor(valueType: ValueType | undefined, value: number | string | null | undefined): string | null {
        if (valueType === 'sem_valor' || value == null) return null;
        return String(value);
    }

    private orNotFound(row: Produto | null): Produto {
        if (!row) throw ProdutoService.notFound();
        return row;
    }

    private static notFound() {
        return new NotFoundError('Produto não encontrado');
    }
}
