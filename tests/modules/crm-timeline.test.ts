import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { contacts, tickets, historic_tickets } from '../../src/modules/atendimento/atendimento.db.schema';
import { etiquetas, contactEtiquetas } from '../../src/modules/etiquetas/etiqueta.db.schema';
import { buildApp } from '../../src/shared/server';

const SUFFIX = Date.now();
let companyId: string;
let otherCompanyId: string;
let userAId: string;
let userBId: string;
let contactId: number;
let ticketId: number;
let tokenA: string;
let tokenB: string;

describe('GET/POST /crm/contacts/:id/timeline', () => {
    const app = buildApp();

    beforeAll(async () => {
        await app.ready();
        const [profile] = await db.select({ id: profiles.id })
            .from(profiles).where(eq(profiles.tag, 'user'));

        const [co] = await db.insert(companies)
            .values({ name: `Empresa Timeline ${SUFFIX}`, status: true })
            .returning({ id: companies.id });
        companyId = co.id;

        const [otherCo] = await db.insert(companies)
            .values({ name: `Empresa Timeline Outra ${SUFFIX}`, status: true })
            .returning({ id: companies.id });
        otherCompanyId = otherCo.id;

        async function makeUser(label: string, coId: string) {
            const [u] = await db.insert(users).values({
                name: label, email: `crm-timeline-${label}-${SUFFIX}@test.com`,
                password_hash: hashSync('senha123', 10),
                profile_id: profile.id, company_id: coId,
                email_verified: true, is_approved: true,
            }).returning({ id: users.id });
            return u.id;
        }
        userAId = await makeUser('usera', companyId);
        userBId = await makeUser('userb', companyId);

        const [ct] = await db.insert(contacts)
            .values({ company_id: companyId, name: `Contato Timeline ${SUFFIX}` })
            .returning({ id: contacts.id });
        contactId = ct.id;

        const [ticket] = await db.insert(tickets).values({
            company_id: companyId, contact_id: contactId,
            status_id: 3, attendant_user_id: userAId, closed_by_user_id: userAId,
        }).returning({ id: tickets.id });
        ticketId = ticket.id;

        // Histórico: aceito (1→2), transferido (2→2), fechado (2→3)
        await db.insert(historic_tickets).values([
            { ticket_id: ticketId, user_id: userAId, status_id_init: 1, status_id_end: 2, created_at: new Date('2026-07-01T10:00:00Z') },
            { ticket_id: ticketId, user_id: userAId, status_id_init: 2, status_id_end: 2, created_at: new Date('2026-07-02T10:00:00Z') },
            { ticket_id: ticketId, user_id: userAId, status_id_init: 2, status_id_end: 3, created_at: new Date('2026-07-03T10:00:00Z') },
        ]);

        const [tag] = await db.insert(etiquetas)
            .values({ company_id: companyId, name: 'Quente', color: '#f59e0b' })
            .returning({ id: etiquetas.id });
        await db.insert(contactEtiquetas).values({
            contact_id: String(contactId), etiqueta_id: tag.id,
            created_at: new Date('2026-07-04T10:00:00Z'),
        });

        async function login(label: string) {
            const res = await app.inject({
                method: 'POST', url: '/api/v1/auth/login',
                payload: { email: `crm-timeline-${label}-${SUFFIX}@test.com`, password: 'senha123' },
            });
            return JSON.parse(res.body).access_token;
        }
        tokenA = await login('usera');
        tokenB = await login('userb');
    });

    it('GET retorna os eventos de ticket + tag, ordenados do mais recente pro mais antigo', async () => {
        const res = await app.inject({
            method: 'GET', url: `/api/v1/crm/contacts/${contactId}/timeline`,
            headers: { authorization: `Bearer ${tokenA}` },
        });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body) as any[];

        expect(body.length).toBeGreaterThanOrEqual(4);
        const dates = body.map(i => new Date(i.created_at).getTime());
        expect(dates).toEqual([...dates].sort((a, b) => b - a));

        const tagItem = body.find(i => i.type === 'tag');
        expect(tagItem).toMatchObject({ tag_name: 'Quente', tag_color: '#f59e0b' });

        const events = body.filter(i => i.type === 'ticket_event').map(i => i.event);
        expect(events).toEqual(expect.arrayContaining(['accepted', 'transferred', 'closed']));
    });

    it('POST cria uma nota, e ela aparece no GET seguinte pra QUALQUER usuário da empresa (não é privada)', async () => {
        const post = await app.inject({
            method: 'POST', url: `/api/v1/crm/contacts/${contactId}/timeline`,
            headers: { authorization: `Bearer ${tokenA}` },
            payload: { body: 'Cliente pediu pra retornar semana que vem.' },
        });
        expect(post.statusCode).toBe(200);
        const created = JSON.parse(post.body);
        expect(created).toMatchObject({ type: 'note', body: 'Cliente pediu pra retornar semana que vem.', user_name: 'usera' });

        const getAsB = await app.inject({
            method: 'GET', url: `/api/v1/crm/contacts/${contactId}/timeline`,
            headers: { authorization: `Bearer ${tokenB}` },
        });
        const body = JSON.parse(getAsB.body) as any[];
        const note = body.find(i => i.type === 'note' && i.body === 'Cliente pediu pra retornar semana que vem.');
        expect(note).toBeTruthy();
        expect(note.user_name).toBe('usera');
    });

    it('404 ao tentar ver a timeline de um contato de outra empresa', async () => {
        const [otherContact] = await db.insert(contacts)
            .values({ company_id: otherCompanyId, name: `Contato Outra Empresa ${SUFFIX}` })
            .returning({ id: contacts.id });

        const res = await app.inject({
            method: 'GET', url: `/api/v1/crm/contacts/${otherContact.id}/timeline`,
            headers: { authorization: `Bearer ${tokenA}` },
        });
        expect(res.statusCode).toBe(404);
    });
});
