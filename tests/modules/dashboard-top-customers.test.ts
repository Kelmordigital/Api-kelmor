import { describe, it, expect } from 'vitest';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { tickets, contacts } from '../../src/modules/atendimento/atendimento.db.schema';
import { salesAnalytics } from '../../src/modules/dashboard/dashboard.module';

const SUFFIX = Date.now();

async function makeCompany() {
    const [co] = await db.insert(companies)
        .values({ name: `Empresa TopCustomers ${SUFFIX}-${Math.random()}`, status: true })
        .returning({ id: companies.id });
    return co.id;
}

async function makeContact(companyId: string, name: string) {
    const [ct] = await db.insert(contacts)
        .values({ company_id: companyId, name })
        .returning({ id: contacts.id });
    return ct.id;
}

async function sale(companyId: string, contactId: number, salePrice: string) {
    await db.insert(tickets).values({
        company_id: companyId, contact_id: contactId,
        status_id: 3, is_sale: 1, service_not_made: 0, sale_price: salePrice,
    });
}

describe('salesAnalytics.topCustomers — quem mais gastou no período', () => {
    it('agrupa por contato, soma o valor gasto e conta pedidos, ordenado por valor desc', async () => {
        const companyId = await makeCompany();
        const alice = await makeContact(companyId, 'Alice');
        const bob = await makeContact(companyId, 'Bob');

        await sale(companyId, alice, '50,00');
        await sale(companyId, alice, '30,00');
        await sale(companyId, bob, '10,00');

        const rows = await salesAnalytics.topCustomers(companyId, { period: 'year' });

        expect(rows[0].name).toBe('Alice');
        expect(rows[0].pedidos).toBe(2);
        expect(rows[0].total).toBeCloseTo(80, 2);

        expect(rows[1].name).toBe('Bob');
        expect(rows[1].pedidos).toBe(1);
        expect(rows[1].total).toBeCloseTo(10, 2);
    });

    it('ignora tickets que não são venda fechada (is_sale=0, aberto, ou marcado service_not_made)', async () => {
        const companyId = await makeCompany();
        const carlos = await makeContact(companyId, 'Carlos');

        await sale(companyId, carlos, '100,00');
        await db.insert(tickets).values({ company_id: companyId, contact_id: carlos, status_id: 3, is_sale: 0, service_not_made: 0, sale_price: '999,00' });
        await db.insert(tickets).values({ company_id: companyId, contact_id: carlos, status_id: 2, is_sale: 1, service_not_made: 0, sale_price: '999,00' });
        await db.insert(tickets).values({ company_id: companyId, contact_id: carlos, status_id: 3, is_sale: 1, service_not_made: 1, sale_price: '999,00' });

        const rows = await salesAnalytics.topCustomers(companyId, { period: 'year' });

        expect(rows).toHaveLength(1);
        expect(rows[0].total).toBeCloseTo(100, 2);
    });

    it('respeita o limite (default 5)', async () => {
        const companyId = await makeCompany();
        for (let i = 0; i < 7; i++) {
            const ct = await makeContact(companyId, `Cliente ${i}`);
            await sale(companyId, ct, `${10 + i},00`);
        }

        const rows = await salesAnalytics.topCustomers(companyId, { period: 'year' });
        expect(rows).toHaveLength(5);
        expect(rows[0].total).toBeCloseTo(16, 2); // o maior (10+6)
    });
});
