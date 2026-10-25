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
export declare class Pagination {
    readonly page: number;
    readonly limit: number;
    private constructor();
    static fromQuery(query: {
        page?: unknown;
        limit?: unknown;
    }, options: PaginationOptions): Pagination;
    get offset(): number;
    toPage<T>(data: T[], total: number): Page<T>;
    private static int;
}
//# sourceMappingURL=pagination.d.ts.map