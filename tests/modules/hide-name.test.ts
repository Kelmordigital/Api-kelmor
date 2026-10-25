import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import {
    contacts, connections, tickets, atendimento_messages,
} from '../../src/modules/atendimento/atendimento.db.schema';
import { companyPermissions } from '../../src/modules/configuracao-geral/configuracao-geral.db.schema';
import { withAttendantNamePrefix } from '../../src/modules/atendimento/message.service';
import { meuPerfilService } from '../../src/modules/meu-perfil/meu-perfil.module';
import { buildApp } from '../../src/shared/server';

describe('withAttendantNamePrefix — função pura', () => {
    it('prefixa a mensagem com o nome do atendente', () => {
        expect(withAttendantNamePrefix('Bom dia!', 'Maria')).toBe('*Maria:*\nBom dia!');
    });

    it('não duplica o prefixo se o texto já começar com ele (case-insensitive)', () => {
        expect(withAttendantNamePrefix('*maria:*\nBom dia!', 'Maria')).toBe('*maria:*\nBom dia!');
    });
});

const SUFFIX = Date.now();
let companyId: string;
let attendantId: string;
let connectionId: number;
let contactId: number;

async function makeOpenTicket() {
    const [ticket] = await db.insert(tickets).values({
        company_id: companyId, contact_id: contactId, connection_id: connectionId,
        status_id: 2, attendant_user_id: attendantId,
    }).returning();
    return ticket;
}

describe('POST /tickets/:id/messages — assinatura "*Nome:*" (config "Ocultar nome do atendente")', () => {
    const app = buildApp();
    let token: string;

    beforeAll(async () => {
        const [profile] = await db.select({ id: profiles.id })
            .from(profiles).where(eq(profiles.tag, 'user'));

        const [co] = await db.insert(companies)
            .values({ name: `Empresa Hide Name ${SUFFIX}`, status: true })
            .returning({ id: companies.id });
        companyId = co.id;

        await db.insert(companyPermissions)
            .values({ company_id: companyId, allow_show_name_on_chat: true })
            .onConflictDoUpdate({ target: companyPermissions.company_id, set: { allow_show_name_on_chat: true } });

        const [u] = await db.insert(users).values({
            name: 'Ana Atendente', email: `hide-name-${SUFFIX}@test.com`,
            password_hash: hashSync('senha123', 10),
            profile_id: profile.id, company_id: companyId,
            email_verified: true, is_approved: true,
        }).returning({ id: users.id });
        attendantId = u.id;

        const [conn] = await db.insert(connections)
            .values({ company_id: companyId, name: 'Conexão Hide Name', status: 'connected' })
            .returning({ id: connections.id });
        connectionId = conn.id;

        const [ct] = await db.insert(contacts)
            .values({ company_id: companyId, name: 'Contato Hide Name' })
            .returning({ id: contacts.id });
        contactId = ct.id;

        await app.ready();
        const login = await app.inject({
            method: 'POST', url: '/api/v1/auth/login',
            payload: { email: `hide-name-${SUFFIX}@test.com`, password: 'senha123' },
        });
        token = JSON.parse(login.body).access_token;
    });

    function sendReq(ticketId: number, body: Record<string, unknown>) {
        return app.inject({
            method: 'POST', url: `/api/v1/atendimento/tickets/${ticketId}/messages`,
            headers: { authorization: `Bearer ${token}` },
            payload: body,
        });
    }

    it('prefixa com o nome quando a permissão está ligada e hideName não foi pedido', async () => {
        const ticket = await makeOpenTicket();
        const res = await sendReq(ticket.id, { body: 'Oi, tudo bem?' });
        expect(res.statusCode).toBe(200);

        const [msg] = await db.select().from(atendimento_messages).where(eq(atendimento_messages.ticket_id, ticket.id));
        expect(msg.body).toBe('*Ana Atendente:*\nOi, tudo bem?');
    });

    it('não prefixa quando hideName=true', async () => {
        const ticket = await makeOpenTicket();
        const res = await sendReq(ticket.id, { body: 'Mensagem sem assinatura', hideName: true });
        expect(res.statusCode).toBe(200);

        const [msg] = await db.select().from(atendimento_messages).where(eq(atendimento_messages.ticket_id, ticket.id));
        expect(msg.body).toBe('Mensagem sem assinatura');
    });

    it('não prefixa quando a empresa tem a permissão desligada, mesmo sem hideName', async () => {
        await db.update(companyPermissions).set({ allow_show_name_on_chat: false }).where(eq(companyPermissions.company_id, companyId));

        const ticket = await makeOpenTicket();
        const res = await sendReq(ticket.id, { body: 'Mensagem normal' });
        expect(res.statusCode).toBe(200);

        const [msg] = await db.select().from(atendimento_messages).where(eq(atendimento_messages.ticket_id, ticket.id));
        expect(msg.body).toBe('Mensagem normal');

        await db.update(companyPermissions).set({ allow_show_name_on_chat: true }).where(eq(companyPermissions.company_id, companyId));
    });
});

describe('meuPerfilService — persistência do modo permanente (hide_name_active)', () => {
    it('grava e lê a preferência de ocultar nome permanentemente', async () => {
        await meuPerfilService.updateProfile(attendantId, companyId, { hide_name_active: true });
        const profile = await meuPerfilService.getProfile(attendantId);
        expect(profile?.hide_name_active).toBe(true);

        await meuPerfilService.updateProfile(attendantId, companyId, { hide_name_active: false });
        const profile2 = await meuPerfilService.getProfile(attendantId);
        expect(profile2?.hide_name_active).toBe(false);
    });
});
