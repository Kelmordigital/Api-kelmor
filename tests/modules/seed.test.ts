import { describe, it, expect, beforeAll } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { db } from '../../src/database/client';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { runSeed } from '../../src/database/seed';

describe('Database Seed', () => {
    beforeAll(async () => {
        await db.delete(users);
        await db.delete(companies);
        await db.delete(profiles);
        await runSeed();
    });

    it('cria 3 profiles', async () => {
        const result = await db.select().from(profiles).orderBy(asc(profiles.id));
        expect(result).toHaveLength(3);
        expect(result[0]).toMatchObject({ id: 1, tag: 'user' });
        expect(result[1]).toMatchObject({ id: 2, tag: 'admin' });
        expect(result[2]).toMatchObject({ id: 3, tag: 'superAdmin' });
    });

    it('cria company Kelmor Teste', async () => {
        const [co] = await db.select().from(companies).where(eq(companies.name, 'Kelmor Teste'));
        expect(co).toBeTruthy();
        expect(co.status).toBe(true);
    });

    it('cria 3 usuários de teste todos aprovados', async () => {
        const result = await db.select().from(users);
        expect(result).toHaveLength(3);
        expect(result.every(u => u.is_approved)).toBe(true);
        expect(result.every(u => u.email_verified)).toBe(true);
    });

    it('filipe é superAdmin sem empresa', async () => {
        const [u] = await db.select().from(users).where(eq(users.email, 'filipe@kelmor.com'));
        expect(u).toBeTruthy();
        expect(u.company_id).toBeNull();
    });

    it('dono tem finance=true e está vinculado à empresa', async () => {
        const [u] = await db.select().from(users).where(eq(users.email, 'dono@kelmor.com'));
        expect(u).toBeTruthy();
        expect(u.finance).toBe(true);
        expect(u.company_id).not.toBeNull();
    });

    it('seed é idempotente', async () => {
        await runSeed();
        const result = await db.select().from(users);
        expect(result).toHaveLength(3);
    });
});
