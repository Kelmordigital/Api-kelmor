import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { connections, tickets, contacts } from '../../src/modules/atendimento/atendimento.db.schema';
import { dashboardService } from '../../src/modules/atendimento/dashboard.service';

const SUFFIX = Date.now();
let companyId: string;
let connectionId: number;
let contactId: number;

// Tickets sem conexão (connection_id null) acontecem de verdade — ex.: criados
// via API de mensagens externas sem conexão informada. As queries de dashboard
// por conexão não podem simplesmente somir com eles do total.
async function ticket(overrides: Partial<typeof tickets.$inferInsert>) {
    const [t] = await db.insert(tickets).values({
        company_id: companyId, contact_id: contactId,
        ...overrides,
    }).returning();
    return t;
}

describe('dashboardService — tickets sem connection_id não podem sumir dos relatórios por conexão', () => {
    beforeAll(async () => {
        const [co] = await db.insert(companies)
            .values({ name: `Empresa DashConn ${SUFFIX}`, status: true })
            .returning({ id: companies.id });
        companyId = co.id;

        const [conn] = await db.insert(connections)
            .values({ company_id: companyId, name: 'Conexão Principal' })
            .returning({ id: connections.id });
        connectionId = conn.id;

        const [ct] = await db.insert(contacts)
            .values({ company_id: companyId, name: `Contato DashConn ${SUFFIX}` })
            .returning({ id: contacts.id });
        contactId = ct.id;
    });

    it('getTicketsByConnection: total inclui os tickets sem conexão, num bucket "Sem conexão"', async () => {
        await ticket({ connection_id: connectionId, status_id: 2 });
        await ticket({ connection_id: null, status_id: 1 });
        await ticket({ connection_id: null, status_id: 2 });

        const rows = await dashboardService.getTicketsByConnection(companyId, { period: 'year' });
        const total = rows.reduce((sum, r) => sum + Number(r.total), 0);

        expect(total).toBeGreaterThanOrEqual(3);
        const semConexao = rows.find(r => r.label === 'Sem conexão');
        expect(semConexao).toBeTruthy();
        expect(Number(semConexao!.total)).toBeGreaterThanOrEqual(2);
    });

    it('salesByConnection: venda fechada sem conexão entra no total, não desaparece', async () => {
        await ticket({ connection_id: null, status_id: 3, is_sale: 1, service_not_made: 0, sale_price: '100,00' });

        const rows = await dashboardService.salesByConnection(companyId, { period: 'year' });
        const semConexao = rows.find(r => r.label === 'Sem conexão');
        expect(semConexao).toBeTruthy();
        expect(Number(semConexao!.total)).toBeGreaterThanOrEqual(1);
    });

    it('notSalesByConnection: não-venda fechada sem conexão entra no total, não desaparece', async () => {
        await ticket({ connection_id: null, status_id: 3, is_sale: 0, service_not_made: 0 });

        const rows = await dashboardService.notSalesByConnection(companyId, { period: 'year' });
        const semConexao = rows.find(r => r.label === 'Sem conexão');
        expect(semConexao).toBeTruthy();
        expect(Number(semConexao!.total)).toBeGreaterThanOrEqual(1);
    });
});
