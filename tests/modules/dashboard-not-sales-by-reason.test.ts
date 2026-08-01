import { describe, it, expect } from 'vitest';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { tickets, contacts, crm_sales_reasons } from '../../src/modules/atendimento/atendimento.db.schema';
import { dashboardService } from '../../src/modules/atendimento/dashboard.service';

const SUFFIX = Date.now();

async function makeCompanyWithReasons() {
    const [co] = await db.insert(companies)
        .values({ name: `Empresa DashReason ${SUFFIX}-${Math.random()}`, status: true })
        .returning({ id: companies.id });
    const companyId = co.id;

    const [ct] = await db.insert(contacts)
        .values({ company_id: companyId, name: `Contato DashReason ${SUFFIX}` })
        .returning({ id: contacts.id });

    const [ra] = await db.insert(crm_sales_reasons).values({ company_id: companyId, reason: 'Dúvidas e Instruções' }).returning({ id: crm_sales_reasons.id });
    const [rb] = await db.insert(crm_sales_reasons).values({ company_id: companyId, reason: 'Orçamento' }).returning({ id: crm_sales_reasons.id });

    return { companyId, contactId: ct.id, reasonA: ra.id, reasonB: rb.id };
}

async function ticket(companyId: string, contactId: number, overrides: Partial<typeof tickets.$inferInsert>) {
    const [t] = await db.insert(tickets).values({
        company_id: companyId, contact_id: contactId, status_id: 3, is_sale: 0, service_not_made: 0,
        ...overrides,
    }).returning();
    return t;
}

describe('dashboardService — não vendas por motivo (gráficos "Gargalos da operação")', () => {
    it('notSalesByReason: agrupa por motivo, ticket sem motivo cai em "Sem motivo"', async () => {
        const { companyId, contactId, reasonA, reasonB } = await makeCompanyWithReasons();
        await ticket(companyId, contactId, { reasons_id: reasonA });
        await ticket(companyId, contactId, { reasons_id: reasonA });
        await ticket(companyId, contactId, { reasons_id: reasonB });
        await ticket(companyId, contactId, { reasons_id: null });

        const rows = await dashboardService.notSalesByReason(companyId, { period: 'year' });
        const byLabel = new Map(rows.map(r => [r.label, Number(r.total)]));

        expect(byLabel.get('Dúvidas e Instruções')).toBe(2);
        expect(byLabel.get('Orçamento')).toBe(1);
        expect(byLabel.get('Sem motivo')).toBe(1);
    });

    it('notSalesByReasonOverTime (period=day): pivota em 24 horas, com a contagem por motivo somada dentro de cada hora', async () => {
        const { companyId, contactId, reasonA, reasonB } = await makeCompanyWithReasons();
        // Todos fecham "agora" (sem forçar updated_at manualmente — comparar
        // um Date construído em JS com o EXTRACT(HOUR) do Postgres é frágil
        // a timezone; o que importa testar aqui é a soma por motivo dentro do
        // bucket e o zero-padding das demais 23 horas, não qual hora exata é).
        await ticket(companyId, contactId, { reasons_id: reasonA });
        await ticket(companyId, contactId, { reasons_id: reasonA });
        await ticket(companyId, contactId, { reasons_id: reasonB });

        const result = await dashboardService.notSalesByReasonOverTime(companyId, { period: 'day' });

        expect(result.buckets).toHaveLength(24);
        expect(result.reasons).toContain('Dúvidas e Instruções');
        expect(result.reasons).toContain('Orçamento');

        const populated = result.buckets.filter((h) => h.total > 0);
        expect(populated).toHaveLength(1);
        expect(populated[0]['Dúvidas e Instruções']).toBe(2);
        expect(populated[0]['Orçamento']).toBe(1);
        expect(populated[0].total).toBe(3);

        expect(result.buckets.filter((h) => h.total === 0)).toHaveLength(23);
    });

    it('notSalesByReasonOverTime (period=week): pivota em 7 dias da semana', async () => {
        const { companyId, contactId, reasonA } = await makeCompanyWithReasons();
        await ticket(companyId, contactId, { reasons_id: reasonA });

        const result = await dashboardService.notSalesByReasonOverTime(companyId, { period: 'week' });

        expect(result.buckets).toHaveLength(7);
        expect(result.buckets.reduce((s, b) => s + b.total, 0)).toBe(1);
    });

    it('notSalesByReasonOverTime (period=month): pivota por dia do mês, um bucket por dia do mês corrente', async () => {
        const { companyId, contactId, reasonA } = await makeCompanyWithReasons();
        await ticket(companyId, contactId, { reasons_id: reasonA });

        const result = await dashboardService.notSalesByReasonOverTime(companyId, { period: 'month' });

        const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
        expect(result.buckets).toHaveLength(daysInMonth);
        expect(result.buckets.reduce((s, b) => s + b.total, 0)).toBe(1);
    });

    it('notSalesByReasonOverTime (period=year): pivota em 12 meses', async () => {
        const { companyId, contactId, reasonA } = await makeCompanyWithReasons();
        await ticket(companyId, contactId, { reasons_id: reasonA });

        const result = await dashboardService.notSalesByReasonOverTime(companyId, { period: 'year' });

        expect(result.buckets).toHaveLength(12);
        expect(result.buckets.reduce((s, b) => s + b.total, 0)).toBe(1);
    });
});
