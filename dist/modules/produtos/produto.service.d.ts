import type { Produto } from './produto.db.schema';
import type { ProdutoRepository } from './produto.repository';
import type { CreateProdutoInput, UpdateProdutoInput } from './produto.dto';
/**
 * Leitura do catálogo — tudo o que outros módulos (ex.: atendimento)
 * precisam de produtos. Eles dependem só desta interface (ISP/DIP).
 */
export interface ProdutoCatalog {
    list(companyId: string): Promise<Produto[]>;
}
export declare class ProdutoService implements ProdutoCatalog {
    private readonly repository;
    constructor(repository: ProdutoRepository);
    list(companyId: string): Promise<Produto[]>;
    findById(id: string, companyId: string): Promise<Produto>;
    create(companyId: string, input: CreateProdutoInput): Promise<Produto>;
    update(id: string, companyId: string, input: UpdateProdutoInput): Promise<Produto>;
    remove(id: string, companyId: string): Promise<void>;
    /** Produto "sem_valor" nunca tem preço; o numeric do banco recebe string. */
    private static priceFor;
    private orNotFound;
    private static notFound;
}
//# sourceMappingURL=produto.service.d.ts.map