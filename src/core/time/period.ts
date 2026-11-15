import { brCalendar, brMidnight } from '../dates/br-day';

export type Period = 'day' | 'week' | 'month' | 'year';

const VALID_PERIODS: Period[] = ['day', 'week', 'month', 'year'];

export function parsePeriod(raw: unknown): Period {
    return VALID_PERIODS.includes(raw as Period) ? (raw as Period) : 'week';
}

/** Período (hoje / esta semana / este mês / este ano) no calendário de Brasília. */
export function getInterval(period: Period, now: Date = new Date()): { start: Date; end: Date } {
    const { year, month, day, weekday } = brCalendar(now);
    const lastMsBefore = (d: Date) => new Date(d.getTime() - 1);
    let start: Date;
    let end: Date;
    switch (period) {
        case 'day':
            start = brMidnight(year, month, day);
            end   = lastMsBefore(brMidnight(year, month, day + 1));
            break;
        case 'week': {
            const diff = weekday === 0 ? -6 : 1 - weekday; // semana de segunda a domingo
            start = brMidnight(year, month, day + diff);
            end   = lastMsBefore(brMidnight(year, month, day + diff + 7));
            break;
        }
        case 'month':
            start = brMidnight(year, month, 1);
            end   = lastMsBefore(brMidnight(year, month + 1, 1));
            break;
        case 'year':
            start = brMidnight(year, 0, 1);
            end   = lastMsBefore(brMidnight(year + 1, 0, 1));
            break;
    }
    return { start, end };
}
