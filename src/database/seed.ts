import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { profiles } from '../modules/profiles/profile.db.schema';
import { companies } from '../modules/companies/company.db.schema';
import { users } from '../modules/auth/auth.schema';
import { db } from './client';

export async function runSeed() {
    // 1. Profiles
    await db.insert(profiles).values([
        { id: 1, name: 'Usuário', tag: 'user' },
        { id: 2, name: 'Administrador', tag: 'admin' },
        { id: 3, name: 'Súper Administrador', tag: 'superAdmin' },
    ]).onConflictDoNothing();
    console.log('[seed] Profiles OK.');

    // 2. Company de teste (check-then-insert para idempotência)
    let [company] = await db.select({ id: companies.id })
        .from(companies)
        .where(eq(companies.name, 'Kelmor Teste'));

    if (!company) {
        const [c] = await db.insert(companies)
            .values({ name: 'Kelmor Teste', status: true })
            .returning({ id: companies.id });
        company = c;
    }
    console.log('[seed] Company OK.');

    // 3. Buscar profile IDs
    const [superAdminProfile] = await db.select({ id: profiles.id })
        .from(profiles).where(eq(profiles.tag, 'superAdmin'));
    const [adminProfile] = await db.select({ id: profiles.id })
        .from(profiles).where(eq(profiles.tag, 'admin'));
    const [userProfile] = await db.select({ id: profiles.id })
        .from(profiles).where(eq(profiles.tag, 'user'));

    // 4. Usuários de teste
    await db.insert(users).values([
        {
            name: 'Filipe',
            email: 'filipe@kelmor.com',
            password_hash: hashSync('kelmor123', 10),
            profile_id: superAdminProfile.id,
            company_id: null,
            email_verified: true,
            is_approved: true,
            finance: false,
        },
        {
            name: 'Dono Empresa Teste',
            email: 'dono@kelmor.com',
            password_hash: hashSync('kelmor123', 10),
            profile_id: adminProfile.id,
            company_id: company.id,
            email_verified: true,
            is_approved: true,
            finance: true,
        },
        {
            name: 'Atendente Teste',
            email: 'user@kelmor.com',
            password_hash: hashSync('kelmor123', 10),
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
