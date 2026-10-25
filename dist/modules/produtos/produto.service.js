"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProdutoService = void 0;
const http_errors_1 = require("../../core/errors/http-errors");
class ProdutoService {
    repository;
    constructor(repository) {
        this.repository = repository;
    }
    list(companyId) {
        return this.repository.listByCompany(companyId);
    }
    async findById(id, companyId) {
        return this.orNotFound(await this.repository.findById(id, companyId));
    }
    create(companyId, input) {
        return this.repository.create(companyId, {
            name: input.name,
            short_description: input.short_description ?? null,
            value_type: input.value_type,
            value: ProdutoService.priceFor(input.value_type, input.value),
            delivery_timeframe: input.delivery_timeframe ?? null,
            how_it_works: input.how_it_works ?? null,
            full_description: input.full_description ?? null,
            is_active: true,
        });
    }
    async update(id, companyId, input) {
        const { value, ...rest } = input;
        const patch = { ...rest };
        if (value !== undefined)
            patch.value = ProdutoService.priceFor(input.value_type, value);
        if (input.value_type === 'sem_valor')
            patch.value = null;
        return this.orNotFound(await this.repository.update(id, companyId, patch));
    }
    async remove(id, companyId) {
        if (!(await this.repository.delete(id, companyId)))
            throw ProdutoService.notFound();
    }
    /** Produto "sem_valor" nunca tem preço; o numeric do banco recebe string. */
    static priceFor(valueType, value) {
        if (valueType === 'sem_valor' || value == null)
            return null;
        return String(value);
    }
    orNotFound(row) {
        if (!row)
            throw ProdutoService.notFound();
        return row;
    }
    static notFound() {
        return new http_errors_1.NotFoundError('Produto não encontrado');
    }
}
exports.ProdutoService = ProdutoService;
//# sourceMappingURL=produto.service.js.map