/**
 * Violação de índice único do Postgres. O drizzle (postgres-js) às vezes
 * envolve o erro do driver em `.cause`, então olhamos os dois níveis.
 */
export declare function isUniqueViolation(err: unknown): boolean;
//# sourceMappingURL=pg-errors.d.ts.map