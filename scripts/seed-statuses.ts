import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { statuses } from '../src/modules/atendimento/atendimento.db.schema';

async function main() {
    const client = postgres(process.env.DATABASE_URL!);
    const db = drizzle(client);

    await db.insert(statuses).values([
        { name: 'Aberto',   tag: 'open'    },
        { name: 'Pendente', tag: 'pending' },
        { name: 'Fechado',  tag: 'closed'  },
    ]).onConflictDoNothing();

    console.log('Statuses inseridos.');
    await client.end();
}

main().catch(console.error);
