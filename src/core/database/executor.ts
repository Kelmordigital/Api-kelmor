import type { DB } from '../../database/client';

/** Transação do Drizzle (o `tx` de `db.transaction`). */
export type DbTransaction = Parameters<Parameters<DB['transaction']>[0]>[0];

/** Banco ou transação: repositórios que também rodam dentro de transação recebem este tipo. */
export type DbExecutor = DB | DbTransaction;
