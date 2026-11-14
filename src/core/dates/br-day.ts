/**
 * Limites de um dia no horário de Brasília para filtros de relatório.
 *
 * O servidor roda em UTC e o front manda só a data ("2026-11-14"). `new Date("2026-11-14")`
 * vira 14/11 00:00 UTC (21:00 do dia 13 em Brasília) e corta o dia inteiro; "T23:59:59" sem fuso
 * corta às 20:59. Aqui a data vale o dia todo de Brasília (sem horário de verão desde 2019).
 * Valor com horário (ISO completo) passa sem mudança.
 */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const BR_OFFSET = '-03:00';

export function startOfDayBR(value: string): Date {
    return new Date(DATE_ONLY.test(value) ? `${value}T00:00:00.000${BR_OFFSET}` : value);
}

export function endOfDayBR(value: string): Date {
    return new Date(DATE_ONLY.test(value) ? `${value}T23:59:59.999${BR_OFFSET}` : value);
}
