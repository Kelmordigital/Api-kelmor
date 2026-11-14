import { sql, type SQL, type SQLWrapper } from 'drizzle-orm';

/**
 * Horário de Brasília para filtros e gráficos.
 *
 * O servidor da API roda em UTC, e o banco guarda os horários em UTC (colunas `timestamp` sem fuso,
 * padrão do Postgres). Brasília é UTC-3 (sem horário de verão desde 2019). Sem conversão:
 * - a data "2026-11-14" vira 14/11 00:00 UTC (21:00 do dia 13 em Brasília) e corta o dia inteiro;
 * - "T23:59:59" sem fuso vira 20:59 em Brasília;
 * - agrupar por hora/dia no banco põe um atendimento das 9:00 na barra das 12h e o que acontece
 *   depois das 21:00 no dia seguinte.
 *
 * Não dá para só trocar o fuso do servidor: a API lê as colunas sem fuso no fuso do servidor, e tudo o
 * que já está gravado andaria 3 horas.
 */
export const BR_TIME_ZONE = 'America/Sao_Paulo';
const BR_OFFSET = '-03:00';
const BR_OFFSET_MS = 3 * 60 * 60 * 1000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** 00:00 de Brasília do dia AAAA-MM-DD. Valor com horário (ISO completo) passa sem mudança. */
export function startOfDayBR(value: string): Date {
    return new Date(DATE_ONLY.test(value) ? `${value}T00:00:00.000${BR_OFFSET}` : value);
}

/** 23:59:59.999 de Brasília do dia AAAA-MM-DD. Valor com horário (ISO completo) passa sem mudança. */
export function endOfDayBR(value: string): Date {
    return new Date(DATE_ONLY.test(value) ? `${value}T23:59:59.999${BR_OFFSET}` : value);
}

/** Dia, mês (0-11), ano e dia da semana (0 = domingo) no calendário de Brasília. */
export function brCalendar(now: Date = new Date()) {
    const local = new Date(now.getTime() - BR_OFFSET_MS);
    return { year: local.getUTCFullYear(), month: local.getUTCMonth(), day: local.getUTCDate(), weekday: local.getUTCDay() };
}

/** 00:00 de Brasília. Aceita estouro como o Date (ex.: dia 0 = último do mês anterior, mês 12 = janeiro seguinte). */
export function brMidnight(year: number, month: number, day: number): Date {
    return new Date(Date.UTC(year, month, day) + BR_OFFSET_MS);
}

/** Hoje (AAAA-MM-DD) em Brasília. */
export function todayBR(now: Date = new Date()): string {
    return new Date(now.getTime() - BR_OFFSET_MS).toISOString().slice(0, 10);
}

/** Coluna de horário (gravada em UTC) no relógio de Brasília, para agrupar por hora/dia/mês no banco. */
export function brLocal(column: SQLWrapper): SQL {
    return sql`(${column} AT TIME ZONE 'UTC' AT TIME ZONE ${sql.raw(`'${BR_TIME_ZONE}'`)})`;
}
