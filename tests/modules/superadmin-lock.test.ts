import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { db } from '../../src/database/client';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { buildApp } from '../../src/shared/server';
import { runSeed } from '../../src/database/seed';
import { env } from '../../src/config/env';

/** Trava tripla: só pode existir 1 superAdmin (register, e índice único no banco). */

const app = buildApp();
const SUFFIX = Date.now();

beforeAll(async () => {
    await app.ready();
    await runSeed(); // garante profiles + filipe@kelmor.com (superAdmin único)
});

afterAll(async () => { await app.close(); });

describe('Trava de superAdmin único', () => {
    it('POST /auth/register com profile_id=3 → 400 mesmo com x-admin-key válida', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/v1/auth/register',
            headers: { 'x-admin-key': env.ADMIN_SECRET },
            payload: {
                name: 'Intruso Super', email: `intruso-${SUFFIX}@test.com`,
                password: 'senha12345', profile_id: 3, company_id: null,
            },
        });
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).message).toBe('Não é permitido criar usuários superAdmin');
    });

    it('INSERT direto de um 2º superAdmin viola o índice único do banco', async () => {
        const [sa] = await db.select({ id: profiles.id })
            .from(profiles).where(eq(profiles.tag, 'superAdmin'));
        let error: (Error & { cause?: unknown }) | undefined;
        try {
            await db.insert(users).values({
                name: 'Segundo Super', email: `segundo-super-${SUFFIX}@test.com`,
                password_hash: hashSync('senha123', 10),
                profile_id: sa.id, company_id: null,
                email_verified: true, is_approved: true,
            });
        } catch (err) {
            error = err as Error & { cause?: unknown };
        }
        // drizzle-orm (driver postgres-js) envolve o erro do Postgres em `.cause`;
        // a mensagem "duplicate key..." não fica no `.message` de topo.
        expect(error).toBeDefined();
        const fullMessage = `${error?.message ?? ''} ${(error?.cause as Error | undefined)?.message ?? ''}`;
        expect(fullMessage).toMatch(/only_one_superadmin|duplicate key/i);
    });
});
