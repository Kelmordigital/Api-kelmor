"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isUniqueViolation = isUniqueViolation;
const UNIQUE_VIOLATION = '23505';
/**
 * Violação de índice único do Postgres. O drizzle (postgres-js) às vezes
 * envolve o erro do driver em `.cause`, então olhamos os dois níveis.
 */
function isUniqueViolation(err) {
    const e = err;
    return e?.code === UNIQUE_VIOLATION || e?.cause?.code === UNIQUE_VIOLATION;
}
//# sourceMappingURL=pg-errors.js.map