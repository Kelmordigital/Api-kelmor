/**
 * Padrão LIKE/ILIKE de "contém" em que o termo é literal: %, _ e \ digitados
 * pelo usuário não viram curingas (o Postgres usa \ como escape por padrão).
 */
export function containsPattern(term: string): string {
    return `%${term.replace(/[\\%_]/g, '\\$&')}%`;
}
