import { describe, it, expect, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { env } from '../../src/config/env';
import { PgAttendantLock } from '../../src/modules/atendimento/tickets/attendant-lock';
import { buildApp } from '../../src/shared/server';

const url = env.TEST_DATABASE_URL ?? env.DATABASE_URL;
const clientA = postgres(url, { max: 1 });
const clientB = postgres(url, { max: 1 });
const lockA = new PgAttendantLock(drizzle(clientA) as any);
const lockB = new PgAttendantLock(drizzle(clientB) as any);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
void buildApp; // garante o mesmo carregamento de ambiente dos outros testes

afterAll(async () => {
    await clientA.end();
    await clientB.end();
});

/** A trava vale entre conexões diferentes (= entre cópias da API). */
describe('PgAttendantLock (trava do atendente no Postgres)', () => {
    async function race(keyB: string, lockOnB: boolean) {
        const marks: string[] = [];
        const a = lockA.run('u1', true, async () => { marks.push('A-start'); await sleep(300); marks.push('A-end'); });
        await sleep(50);
        const b = lockB.run(keyB, lockOnB, async () => { marks.push('B-start'); });
        await Promise.all([a, b]);
        return marks;
    }

    it('mesma chave: a segunda transação só começa depois que a primeira termina', async () => {
        expect(await race('u1', true)).toEqual(['A-start', 'A-end', 'B-start']);
    });

    it('chaves diferentes não se bloqueiam', async () => {
        expect(await race('u2', true)).toEqual(['A-start', 'B-start', 'A-end']);
    });

    it('lock=false não trava', async () => {
        expect(await race('u1', false)).toEqual(['A-start', 'B-start', 'A-end']);
    });
});
