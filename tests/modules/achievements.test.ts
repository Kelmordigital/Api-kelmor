import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { contacts, tickets } from '../../src/modules/atendimento/atendimento.db.schema';
import {
    InvalidMissionKeyError,
    GamificationDisabledError,
    MISSION_KEYS,
} from '../../src/modules/achievements/achievements.service';
import { achievementsService } from '../../src/modules/achievements/achievements.module';
import { companyPermissions } from '../../src/modules/configuracao-geral/configuracao-geral.db.schema';
import { runSeed } from '../../src/database/seed';
import { buildApp } from '../../src/shared/server';

const SUFFIX = Date.now();
let companyId: string;
let adminUserId: string;
let attendantUserId: string;
let contactId: number;

beforeAll(async () => {
    await runSeed();
    const [adminProfile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'admin'));
    const [userProfile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'user'));

    const [co] = await db.insert(companies)
        .values({ name: `Empresa Achievements ${SUFFIX}`, status: true })
        .returning({ id: companies.id });
    companyId = co.id;

    const [admin] = await db.insert(users).values({
        name: 'Admin Achievements', email: `achievements-admin-${SUFFIX}@test.com`,
        password_hash: hashSync('senha123', 10),
        profile_id: adminProfile.id, company_id: companyId,
        email_verified: true, is_approved: true,
    }).returning({ id: users.id });
    adminUserId = admin.id;

    const [attendant] = await db.insert(users).values({
        name: 'Atendente Achievements', email: `achievements-user-${SUFFIX}@test.com`,
        password_hash: hashSync('senha123', 10),
        profile_id: userProfile.id, company_id: companyId,
        email_verified: true, is_approved: true,
    }).returning({ id: users.id });
    attendantUserId = attendant.id;

    const [ct] = await db.insert(contacts)
        .values({ company_id: companyId, name: 'Contato Achievements', number: '5511999991111' })
        .returning({ id: contacts.id });
    contactId = ct.id;
});

async function closeTicketFor(userId: string) {
    await db.insert(tickets).values({
        company_id: companyId, contact_id: contactId, status_id: 3, closed_by_user_id: userId,
    });
}

describe('achievementsService.getProgress', () => {
    it('começa vazio: nenhuma missão, nenhum ticket fechado, patente Aprendiz', async () => {
        const progress = await achievementsService.getProgress(adminUserId, companyId);
        expect(progress.completed_missions).toEqual([]);
        expect(progress.closed_tickets_count).toBe(0);
        expect(progress.patente).toBe('Aprendiz');
        expect(progress.sub_level).toBeNull();
    });

    it('sobe de patente conforme missões concluídas', async () => {
        await achievementsService.completeMission(adminUserId, companyId, MISSION_KEYS[0]);
        await achievementsService.completeMission(adminUserId, companyId, MISSION_KEYS[1]);

        const progress = await achievementsService.getProgress(adminUserId, companyId);
        expect(progress.completed_missions).toHaveLength(2);
        expect(progress.patente).toBe('Explorador');
    });

    it('chega em Mestre ao completar as 6 missões, sub_level começa em 1', async () => {
        for (const key of MISSION_KEYS) {
            await achievementsService.completeMission(adminUserId, companyId, key);
        }
        const progress = await achievementsService.getProgress(adminUserId, companyId);
        expect(progress.completed_missions).toHaveLength(MISSION_KEYS.length);
        expect(progress.patente).toBe('Mestre');
        expect(progress.sub_level).toBe(1);
    });

    it('sub_level sobe conforme atendimentos fechados, só depois de Mestre', async () => {
        for (let i = 0; i < 10; i++) await closeTicketFor(adminUserId);

        const progress = await achievementsService.getProgress(adminUserId, companyId);
        expect(progress.closed_tickets_count).toBe(10);
        expect(progress.patente).toBe('Mestre');
        expect(progress.sub_level).toBe(2);
    });

    it('conta só os tickets fechados por ESTE usuário, não por outro', async () => {
        await closeTicketFor(attendantUserId);
        const progressAdmin = await achievementsService.getProgress(adminUserId, companyId);
        const progressAttendant = await achievementsService.getProgress(attendantUserId, companyId);

        expect(progressAdmin.closed_tickets_count).toBe(10);
        expect(progressAttendant.closed_tickets_count).toBe(1);
    });
});

describe('achievementsService.completeMission', () => {
    it('rejeita chave de missão desconhecida', async () => {
        await expect(
            achievementsService.completeMission(attendantUserId, companyId, 'missao_que_nao_existe')
        ).rejects.toBeInstanceOf(InvalidMissionKeyError);
    });

    it('é idempotente: completar a mesma missão duas vezes não duplica', async () => {
        await achievementsService.completeMission(attendantUserId, companyId, MISSION_KEYS[0]);
        await achievementsService.completeMission(attendantUserId, companyId, MISSION_KEYS[0]);

        const progress = await achievementsService.getProgress(attendantUserId, companyId);
        expect(progress.completed_missions).toEqual([MISSION_KEYS[0]]);
    });
});

describe('HTTP /api/v1/achievements', () => {
    const app = buildApp();
    let adminToken: string;
    let attendantToken: string;

    beforeAll(async () => {
        await app.ready();

        const adminLogin = await app.inject({
            method: 'POST', url: '/api/v1/auth/login',
            payload: { email: `achievements-admin-${SUFFIX}@test.com`, password: 'senha123' },
        });
        adminToken = JSON.parse(adminLogin.body).access_token;

        const attendantLogin = await app.inject({
            method: 'POST', url: '/api/v1/auth/login',
            payload: { email: `achievements-user-${SUFFIX}@test.com`, password: 'senha123' },
        });
        attendantToken = JSON.parse(attendantLogin.body).access_token;
    });

    afterAll(async () => { await app.close(); });

    it('GET /achievements/progress retorna 200 para admin', async () => {
        const res = await app.inject({
            method: 'GET', url: '/api/v1/achievements/progress',
            headers: { authorization: `Bearer ${adminToken}` },
        });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body).toHaveProperty('patente');
    });

    it('GET /achievements/progress retorna 200 para atendente comum (lê o próprio progresso, pra barra de XP)', async () => {
        const res = await app.inject({
            method: 'GET', url: '/api/v1/achievements/progress',
            headers: { authorization: `Bearer ${attendantToken}` },
        });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body).toHaveProperty('xp');
    });

    it('POST /achievements/complete retorna 403 para atendente comum (concluir missão continua admin-only)', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/v1/achievements/complete',
            headers: { authorization: `Bearer ${attendantToken}` },
            payload: { mission_key: MISSION_KEYS[0] },
        });
        expect(res.statusCode).toBe(403);
    });

    it('POST /achievements/complete com chave inválida retorna 400', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/v1/achievements/complete',
            headers: { authorization: `Bearer ${adminToken}` },
            payload: { mission_key: 'invalida' },
        });
        expect(res.statusCode).toBe(400);
    });

    it('POST /achievements/complete com chave válida retorna 200 e grava no banco', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/v1/achievements/complete',
            headers: { authorization: `Bearer ${adminToken}` },
            payload: { mission_key: MISSION_KEYS[2] },
        });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.completed_missions).toContain(MISSION_KEYS[2]);
    });
});

describe('achievementsService.getCompanyProgress', () => {
    it('retorna o progresso de cada usuário pedido, na mesma empresa', async () => {
        const map = await achievementsService.getCompanyProgress(companyId, [adminUserId, attendantUserId]);
        expect(map[adminUserId].patente).toBe('Mestre');
        expect(map[adminUserId].closed_tickets_count).toBe(10);
        expect(map[attendantUserId].completed_missions).toContain(MISSION_KEYS[0]);
    });

    it('retorna progresso vazio (Aprendiz) para usuário sem nenhuma atividade', async () => {
        const [userProfile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'user'));
        const [freshUser] = await db.insert(users).values({
            name: 'Fresh User', email: `achievements-fresh-${SUFFIX}@test.com`,
            password_hash: hashSync('senha123', 10),
            profile_id: userProfile.id, company_id: companyId,
            email_verified: true, is_approved: true,
        }).returning({ id: users.id });

        const map = await achievementsService.getCompanyProgress(companyId, [freshUser.id]);
        expect(map[freshUser.id]).toEqual({
            completed_missions: [], closed_tickets_count: 0, patente: 'Aprendiz', sub_level: null, xp: 0,
        });
    });
});

describe('achievementsService — expõe o XP real (coluna users.xp)', () => {
    it('getProgress reflete o xp armazenado no usuário', async () => {
        const [userProfile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'user'));
        const [xpUser] = await db.insert(users).values({
            name: 'Usuário XP', email: `achievements-xp-${SUFFIX}@test.com`,
            password_hash: hashSync('senha123', 10),
            profile_id: userProfile.id, company_id: companyId,
            email_verified: true, is_approved: true, xp: 47,
        }).returning({ id: users.id });

        const p = await achievementsService.getProgress(xpUser.id, companyId);
        expect(p.xp).toBe(47);
    });

    it('getCompanyProgress reflete o mesmo xp armazenado', async () => {
        const [userProfile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'user'));
        const [xpUser] = await db.insert(users).values({
            name: 'Usuário XP Bulk', email: `achievements-xp-bulk-${SUFFIX}@test.com`,
            password_hash: hashSync('senha123', 10),
            profile_id: userProfile.id, company_id: companyId,
            email_verified: true, is_approved: true, xp: 20,
        }).returning({ id: users.id });

        const map = await achievementsService.getCompanyProgress(companyId, [xpUser.id]);
        expect(map[xpUser.id].xp).toBe(20);
    });
});

// Simula uma "partida completa" do zero: percorre todas as 4 patentes na
// ordem exata em que o usuário real vivencia, e depois valida o crescimento
// infinito de sub-nível pós-Mestre — provando o funcionamento fim a fim do
// mini-game, não só peças isoladas. Usuário próprio, isolado dos outros
// describes deste arquivo.
describe('Partida completa: Aprendiz → Explorador → Aventureiro → Mestre → Mestre II', () => {
    let playerId: string;

    beforeAll(async () => {
        const [userProfile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'user'));
        const [player] = await db.insert(users).values({
            name: 'Jogador Completo', email: `achievements-playthrough-${SUFFIX}@test.com`,
            password_hash: hashSync('senha123', 10),
            profile_id: userProfile.id, company_id: companyId,
            email_verified: true, is_approved: true,
        }).returning({ id: users.id });
        playerId = player.id;
    });

    it('estado inicial: Aprendiz, zerado', async () => {
        const p = await achievementsService.getProgress(playerId, companyId);
        expect(p).toEqual({ completed_missions: [], closed_tickets_count: 0, patente: 'Aprendiz', sub_level: null, xp: 0 });
    });

    it('1ª missão: continua Aprendiz (patente só sobe a cada 2)', async () => {
        await achievementsService.completeMission(playerId, companyId, MISSION_KEYS[0]);
        const p = await achievementsService.getProgress(playerId, companyId);
        expect(p.patente).toBe('Aprendiz');
        expect(p.completed_missions).toHaveLength(1);
    });

    it('2ª missão: sobe pra Explorador exatamente no limiar', async () => {
        await achievementsService.completeMission(playerId, companyId, MISSION_KEYS[1]);
        const p = await achievementsService.getProgress(playerId, companyId);
        expect(p.patente).toBe('Explorador');
    });

    it('3ª missão: continua Explorador', async () => {
        await achievementsService.completeMission(playerId, companyId, MISSION_KEYS[2]);
        const p = await achievementsService.getProgress(playerId, companyId);
        expect(p.patente).toBe('Explorador');
    });

    it('4ª missão: sobe pra Aventureiro', async () => {
        await achievementsService.completeMission(playerId, companyId, MISSION_KEYS[3]);
        const p = await achievementsService.getProgress(playerId, companyId);
        expect(p.patente).toBe('Aventureiro');
    });

    it('5ª missão: continua Aventureiro', async () => {
        await achievementsService.completeMission(playerId, companyId, MISSION_KEYS[4]);
        const p = await achievementsService.getProgress(playerId, companyId);
        expect(p.patente).toBe('Aventureiro');
    });

    it('6ª e última missão: sobe pra Mestre, sub_level nasce em 1 (0 atendimentos ainda)', async () => {
        await achievementsService.completeMission(playerId, companyId, MISSION_KEYS[5]);
        const p = await achievementsService.getProgress(playerId, companyId);
        expect(p.completed_missions).toHaveLength(6);
        expect(p.patente).toBe('Mestre');
        expect(p.sub_level).toBe(1);
    });

    it('atendimentos fechados 1-9: patente e sub_level ficam parados em Mestre I', async () => {
        for (let i = 0; i < 9; i++) await closeTicketFor(playerId);
        const p = await achievementsService.getProgress(playerId, companyId);
        expect(p.closed_tickets_count).toBe(9);
        expect(p.patente).toBe('Mestre');
        expect(p.sub_level).toBe(1);
    });

    it('10º atendimento fechado: sub_level sobe pra Mestre II', async () => {
        await closeTicketFor(playerId);
        const p = await achievementsService.getProgress(playerId, companyId);
        expect(p.closed_tickets_count).toBe(10);
        expect(p.sub_level).toBe(2);
    });

    it('mais 15 atendimentos (total 25): sub_level chega em Mestre III, sem teto', async () => {
        for (let i = 0; i < 15; i++) await closeTicketFor(playerId);
        const p = await achievementsService.getProgress(playerId, companyId);
        expect(p.closed_tickets_count).toBe(25);
        expect(p.sub_level).toBe(3); // 1 + floor(25/10)
    });

    it('getCompanyProgress bate exatamente com getProgress pro mesmo usuário (consistência entre os dois caminhos)', async () => {
        const individual = await achievementsService.getProgress(playerId, companyId);
        const bulk = await achievementsService.getCompanyProgress(companyId, [playerId]);
        expect(bulk[playerId]).toEqual(individual);
    });

    it('reflete o estado final também via HTTP (fim a fim)', async () => {
        // Jogador tem profile "user" (atendente) — não acessa o endpoint hoje.
        // Sobe o próprio profile_id pra admin só nesta checagem, direto no banco,
        // pra validar a resposta HTTP final sem reabrir os outros describes.
        const [adminProfile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'admin'));
        await db.update(users).set({ profile_id: adminProfile.id }).where(eq(users.id, playerId));

        const app = buildApp();
        await app.ready();
        const login = await app.inject({
            method: 'POST', url: '/api/v1/auth/login',
            payload: { email: `achievements-playthrough-${SUFFIX}@test.com`, password: 'senha123' },
        });
        const token = JSON.parse(login.body).access_token;

        const res = await app.inject({
            method: 'GET', url: '/api/v1/achievements/progress',
            headers: { authorization: `Bearer ${token}` },
        });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.patente).toBe('Mestre');
        expect(body.sub_level).toBe(3);
        expect(body.closed_tickets_count).toBe(25);

        await app.close();
    });
});

describe('Chave-mestra: gamification_enabled (Configurações Gerais)', () => {
    let gateUserId: string;
    let gateCompanyId: string;

    beforeAll(async () => {
        const [profile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'user'));
        const [co] = await db.insert(companies)
            .values({ name: `Empresa Gate ${SUFFIX}`, status: true })
            .returning({ id: companies.id });
        gateCompanyId = co.id;

        const [u] = await db.insert(users).values({
            name: 'Usuário Gate', email: `achievements-gate-${SUFFIX}@test.com`,
            password_hash: hashSync('senha123', 10),
            profile_id: profile.id, company_id: gateCompanyId,
            email_verified: true, is_approved: true,
        }).returning({ id: users.id });
        gateUserId = u.id;
    });

    it('com a experiência gamer ligada (padrão), getProgress funciona normalmente', async () => {
        const p = await achievementsService.getProgress(gateUserId, gateCompanyId);
        expect(p.patente).toBe('Aprendiz');
    });

    it('desligando gamification_enabled, getProgress lança GamificationDisabledError', async () => {
        await db.insert(companyPermissions)
            .values({ company_id: gateCompanyId, gamification_enabled: false })
            .onConflictDoUpdate({ target: companyPermissions.company_id, set: { gamification_enabled: false } });

        await expect(
            achievementsService.getProgress(gateUserId, gateCompanyId)
        ).rejects.toBeInstanceOf(GamificationDisabledError);
    });

    it('desligado, completeMission também lança GamificationDisabledError', async () => {
        await expect(
            achievementsService.completeMission(gateUserId, gateCompanyId, MISSION_KEYS[0])
        ).rejects.toBeInstanceOf(GamificationDisabledError);
    });

    it('desligado, getCompanyProgress (usado pela tela de Usuários) continua funcionando — não trava a listagem de usuários', async () => {
        const map = await achievementsService.getCompanyProgress(gateCompanyId, [gateUserId]);
        expect(map[gateUserId].patente).toBe('Aprendiz');
    });

    it('desligado, GET /achievements/progress retorna 403 via HTTP', async () => {
        const [adminProfile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'admin'));
        await db.update(users).set({ profile_id: adminProfile.id }).where(eq(users.id, gateUserId));

        await db.update(companyPermissions)
            .set({ gamification_enabled: false })
            .where(eq(companyPermissions.company_id, gateCompanyId));

        const app = buildApp();
        await app.ready();
        const login = await app.inject({
            method: 'POST', url: '/api/v1/auth/login',
            payload: { email: `achievements-gate-${SUFFIX}@test.com`, password: 'senha123' },
        });
        const token = JSON.parse(login.body).access_token;

        const res = await app.inject({
            method: 'GET', url: '/api/v1/achievements/progress',
            headers: { authorization: `Bearer ${token}` },
        });
        expect(res.statusCode).toBe(403);

        await app.close();
    });

    it('religando gamification_enabled, getProgress volta a funcionar', async () => {
        await db.update(companyPermissions)
            .set({ gamification_enabled: true })
            .where(eq(companyPermissions.company_id, gateCompanyId));

        const p = await achievementsService.getProgress(gateUserId, gateCompanyId);
        expect(p.patente).toBe('Aprendiz');
    });
});
