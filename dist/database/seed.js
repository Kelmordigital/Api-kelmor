"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSeed = runSeed;
const drizzle_orm_1 = require("drizzle-orm");
const bcryptjs_1 = require("bcryptjs");
const profile_db_schema_1 = require("../modules/profiles/profile.db.schema");
const company_db_schema_1 = require("../modules/companies/company.db.schema");
const auth_schema_1 = require("../modules/auth/auth.schema");
const client_1 = require("./client");
async function runSeed() {
    // 1. Profiles
    await client_1.db.insert(profile_db_schema_1.profiles).values([
        { id: 1, name: 'Usuário', tag: 'user' },
        { id: 2, name: 'Administrador', tag: 'admin' },
        { id: 3, name: 'Súper Administrador', tag: 'superAdmin' },
    ]).onConflictDoNothing();
    console.log('[seed] Profiles OK.');
    // 2. Company de teste (check-then-insert para idempotência)
    let [company] = await client_1.db.select({ id: company_db_schema_1.companies.id })
        .from(company_db_schema_1.companies)
        .where((0, drizzle_orm_1.eq)(company_db_schema_1.companies.name, 'Kelmor Teste'));
    if (!company) {
        const [c] = await client_1.db.insert(company_db_schema_1.companies)
            .values({ name: 'Kelmor Teste', status: true })
            .returning({ id: company_db_schema_1.companies.id });
        company = c;
    }
    console.log('[seed] Company OK.');
    // 3. Buscar profile IDs
    const [superAdminProfile] = await client_1.db.select({ id: profile_db_schema_1.profiles.id })
        .from(profile_db_schema_1.profiles).where((0, drizzle_orm_1.eq)(profile_db_schema_1.profiles.tag, 'superAdmin'));
    const [adminProfile] = await client_1.db.select({ id: profile_db_schema_1.profiles.id })
        .from(profile_db_schema_1.profiles).where((0, drizzle_orm_1.eq)(profile_db_schema_1.profiles.tag, 'admin'));
    const [userProfile] = await client_1.db.select({ id: profile_db_schema_1.profiles.id })
        .from(profile_db_schema_1.profiles).where((0, drizzle_orm_1.eq)(profile_db_schema_1.profiles.tag, 'user'));
    // 4. Usuários de teste
    await client_1.db.insert(auth_schema_1.users).values([
        {
            name: 'Filipe',
            email: 'filipe@kelmor.com',
            password_hash: (0, bcryptjs_1.hashSync)('kelmor123', 10),
            profile_id: superAdminProfile.id,
            company_id: null,
            email_verified: true,
            is_approved: true,
            finance: false,
        },
        {
            name: 'Dono Empresa Teste',
            email: 'dono@kelmor.com',
            password_hash: (0, bcryptjs_1.hashSync)('kelmor123', 10),
            profile_id: adminProfile.id,
            company_id: company.id,
            email_verified: true,
            is_approved: true,
            finance: true,
        },
        {
            name: 'Atendente Teste',
            email: 'user@kelmor.com',
            password_hash: (0, bcryptjs_1.hashSync)('kelmor123', 10),
            profile_id: userProfile.id,
            company_id: company.id,
            email_verified: true,
            is_approved: true,
            finance: false,
        },
    ]).onConflictDoNothing();
    console.log('[seed] Usuários OK.');
    console.log('');
    console.log('  filipe@kelmor.com   / kelmor123  (superAdmin)');
    console.log('  dono@kelmor.com     / kelmor123  (admin + finance)');
    console.log('  user@kelmor.com     / kelmor123  (atendente)');
}
if (require.main === module) {
    require('dotenv/config');
    runSeed()
        .then(() => { console.log('[seed] Concluído.'); process.exit(0); })
        .catch((err) => { console.error('[seed] Erro:', err); process.exit(1); });
}
//# sourceMappingURL=seed.js.map