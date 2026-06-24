import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { connections } from '../src/modules/atendimento/atendimento.db.schema';
import { companies } from '../src/modules/companies/company.db.schema';

async function main() {
    const client = postgres(process.env.DATABASE_URL!);
    const db = drizzle(client);

    const [company] = await db.select().from(companies).limit(1);
    if (!company) {
        console.error('Nenhuma empresa no banco. Cadastre uma empresa primeiro.');
        process.exit(1);
    }

    await db.insert(connections).values({
        company_id: company.id,
        name: 'kelmor-main',
        type: 'whatsapp',
        status: 'connected',
    }).onConflictDoNothing();

    const [conn] = await db.select().from(connections).limit(1);
    console.log(`Connection criada/existente — ID: ${conn.id}, empresa: ${company.name}`);
    await client.end();
}

main().catch(console.error);
