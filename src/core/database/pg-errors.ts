const UNIQUE_VIOLATION = '23505';

/**
 * Violação de índice único do Postgres. O drizzle (postgres-js) às vezes
 * envolve o erro do driver em `.cause`, então olhamos os dois níveis.
 */
export function isUniqueViolation(err: unknown): boolean {
    const e = err as { code?: string; cause?: { code?: string } } | null;
    return e?.code === UNIQUE_VIOLATION || e?.cause?.code === UNIQUE_VIOLATION;
}
