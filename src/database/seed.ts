import { profiles } from '../modules/profiles/profile.db.schema';
import { db } from './client';

export async function runSeed() {
    await db
        .insert(profiles)
        .values([
            { id: 1, name: 'Usuário', tag: 'user' },
            { id: 2, name: 'Administrador', tag: 'admin' },
            { id: 3, name: 'Súper Administrador', tag: 'superAdmin' },
        ])
        .onConflictDoNothing();

    console.log('[seed] Profiles inseridos.');
}

if (require.main === module) {
    require('dotenv/config');
    runSeed()
        .then(() => {
            console.log('[seed] Concluído.');
            process.exit(0);
        })
        .catch((err) => {
            console.error('[seed] Erro:', err);
            process.exit(1);
        });
}
