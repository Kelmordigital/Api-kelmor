"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Pagination = void 0;
/**
 * Paginação a partir da query string. Valores ausentes ou não numéricos usam
 * o padrão; page mínima é 1 e limit fica entre 1 e maxLimit.
 */
class Pagination {
    page;
    limit;
    constructor(page, limit) {
        this.page = page;
        this.limit = limit;
    }
    static fromQuery(query, options) {
        const page = Math.max(1, Pagination.int(query.page) ?? 1);
        const limit = Math.min(options.maxLimit, Math.max(1, Pagination.int(query.limit) ?? options.defaultLimit));
        return new Pagination(page, limit);
    }
    get offset() {
        return (this.page - 1) * this.limit;
    }
    toPage(data, total) {
        return { data, total, page: this.page, limit: this.limit, totalPages: Math.ceil(total / this.limit) };
    }
    static int(raw) {
        if (raw === undefined || raw === '')
            return undefined;
        const n = Math.trunc(Number(raw));
        return Number.isFinite(n) ? n : undefined;
    }
}
exports.Pagination = Pagination;
//# sourceMappingURL=pagination.js.map