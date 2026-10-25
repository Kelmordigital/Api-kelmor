export interface Page<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export interface PaginationOptions {
    defaultLimit: number;
    maxLimit: number;
}

/**
 * Paginação a partir da query string. Valores ausentes ou não numéricos usam
 * o padrão; page mínima é 1 e limit fica entre 1 e maxLimit.
 */
export class Pagination {
    private constructor(readonly page: number, readonly limit: number) {}

    static fromQuery(query: { page?: unknown; limit?: unknown }, options: PaginationOptions): Pagination {
        const page  = Math.max(1, Pagination.int(query.page) ?? 1);
        const limit = Math.min(options.maxLimit, Math.max(1, Pagination.int(query.limit) ?? options.defaultLimit));
        return new Pagination(page, limit);
    }

    get offset(): number {
        return (this.page - 1) * this.limit;
    }

    toPage<T>(data: T[], total: number): Page<T> {
        return { data, total, page: this.page, limit: this.limit, totalPages: Math.ceil(total / this.limit) };
    }

    private static int(raw: unknown): number | undefined {
        if (raw === undefined || raw === '') return undefined;
        const n = Math.trunc(Number(raw));
        return Number.isFinite(n) ? n : undefined;
    }
}
