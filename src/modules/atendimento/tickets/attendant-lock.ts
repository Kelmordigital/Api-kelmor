import { sql } from 'drizzle-orm';
import type { DB } from '../../../database/client';
import type { DbTransaction } from '../../../core/database/executor';

/**
 * Serializa operações por atendente entre TODAS as cópias da API (spec 7.9):
 * transação com pg_advisory_xact_lock na chave do atendente. Quem chega depois
 * espera a vez (não falha). Dentro de `work`, use só o `tx` — em teste o pool tem 1 conexão.
 */
export interface AttendantLock {
    run<T>(attendantId: string, lock: boolean, work: (tx: DbTransaction) => Promise<T>): Promise<T>;
}

export class PgAttendantLock implements AttendantLock {
    constructor(private readonly db: DB) {}

    run<T>(attendantId: string, lock: boolean, work: (tx: DbTransaction) => Promise<T>): Promise<T> {
        return this.db.transaction(async (tx) => {
            if (lock) await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'attendant-limit:' + attendantId}))`);
            return work(tx);
        });
    }
}
