"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.containsPattern = containsPattern;
/**
 * Padrão LIKE/ILIKE de "contém" em que o termo é literal: %, _ e \ digitados
 * pelo usuário não viram curingas (o Postgres usa \ como escape por padrão).
 */
function containsPattern(term) {
    return `%${term.replace(/[\\%_]/g, '\\$&')}%`;
}
//# sourceMappingURL=like-pattern.js.map