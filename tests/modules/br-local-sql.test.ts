import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { db } from '../../src/database/client';
import { brLocal } from '../../src/core/dates/br-day';

describe('Agrupamento por hora/dia no banco em horário de Brasília', () => {
    it('01:30 UTC do dia 15 = 22h do dia 14 em Brasília', async () => {
        const col = sql`'2026-11-15 01:30:00'::timestamp`;
        const rows = await db.execute<{ hora: number; dia: string }>(sql`
            select extract(hour from ${brLocal(col)})::int as hora, date(${brLocal(col)})::text as dia`);
        const [row] = rows as unknown as { hora: number; dia: string }[];
        expect(row).toEqual({ hora: 22, dia: '2026-11-14' });
    });
});
