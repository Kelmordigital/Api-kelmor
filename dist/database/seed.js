"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSeed = runSeed;
const profile_db_schema_1 = require("../modules/profiles/profile.db.schema");
const client_1 = require("./client");
async function runSeed() {
    await client_1.db
        .insert(profile_db_schema_1.profiles)
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
//# sourceMappingURL=seed.js.map