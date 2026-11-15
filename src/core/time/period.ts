export type Period = 'day' | 'week' | 'month' | 'year';

const VALID_PERIODS: Period[] = ['day', 'week', 'month', 'year'];

export function parsePeriod(raw: unknown): Period {
    return VALID_PERIODS.includes(raw as Period) ? (raw as Period) : 'week';
}

/** Intervalo [início, fim] do período atual (dia, semana seg–dom, mês, ano) no horário local. */
export function getInterval(period: Period): { start: Date; end: Date } {
    const now = new Date();
    let start: Date;
    let end: Date;
    switch (period) {
        case 'day':
            start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
            end   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
            break;
        case 'week': {
            const dow = now.getDay();
            const diff = dow === 0 ? -6 : 1 - dow;
            start = new Date(now); start.setDate(now.getDate() + diff); start.setHours(0, 0, 0, 0);
            end   = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999);
            break;
        }
        case 'month':
            start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
            end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            break;
        case 'year':
            start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
            end   = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
            break;
    }
    return { start, end };
}
