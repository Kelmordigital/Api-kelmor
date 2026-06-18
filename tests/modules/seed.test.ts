import { describe, it, expect, beforeAll } from 'vitest';
import { asc } from 'drizzle-orm';
import { db } from '../../src/database/client';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { runSeed } from '../../src/database/seed';

describe('Database Seed', () => {
    beforeAll(async () => {
        await db.delete(profiles);
        await runSeed();
    });

    it('cria 3 profiles', async () => {
        const result = await db.select().from(profiles);
        expect(result).toHaveLength(3);
    });

    it('profiles têm os tags corretos', async () => {
        const result = await db.select().from(profiles).orderBy(asc(profiles.id));
        expect(result[0]).toMatchObject({ id: 1, tag: 'user' });
        expect(result[1]).toMatchObject({ id: 2, tag: 'admin' });
        expect(result[2]).toMatchObject({ id: 3, tag: 'superAdmin' });
    });

    it('seed é idempotente', async () => {
        await runSeed();
        const result = await db.select().from(profiles);
        expect(result).toHaveLength(3);
    });
});
