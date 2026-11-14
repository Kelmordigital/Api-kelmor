import { BadRequestError, NotFoundError } from '../../core/errors/http-errors';
import type { Pagination } from '../../core/http/pagination';
import type { SaleOutcome, SaleRow, SalesFilter, SalesReportRepository } from './crm.repository';
import type { UpdateSaleInput } from './crm.dto';
import { SalePrice } from './sale-price';

/** Formato que a tela de relatórios lê (nome do campo `salesMade` vale para os dois relatórios). */
function toListItem(r: SaleRow, withPrice: boolean) {
    return {
        id: r.id,
        origin: r.origin,
        ...(withPrice ? { sale_price: r.sale_price } : {}),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        contact: { name: r.contact_name, number: r.contact_number },
        attendant_user: r.attendant_name ? { name: r.attendant_name } : null,
        queue: r.queue_name ? { name: r.queue_name } : null,
        sale_reason: r.reason ? { id: r.reason_id, name: r.reason } : null,
    };
}

/** Relatórios de vendas feitas e perdidas, e a correção de uma venda (RN-CRM-06 a 08). */
export class SalesReportService {
    constructor(private readonly repository: SalesReportRepository) {}

    async salesMade(companyId: string, filter: SalesFilter, pagination: Pagination) {
        const [{ rows, count }, prices] = await Promise.all([
            this.repository.page(companyId, 'made', filter, pagination),
            this.repository.prices(companyId, filter),
        ]);
        const values = prices.map(SalePrice.toNumber);
        const totalValue = values.reduce((sum, v) => sum + v, 0);
        return {
            ...this.envelope(rows.map((r) => toListItem(r, true)), count, pagination),
            totalValue,
            avgValue: values.length ? totalValue / values.length : 0,
        };
    }

    async salesNotMade(companyId: string, filter: SalesFilter, pagination: Pagination) {
        const { rows, count } = await this.repository.page(companyId, 'not_made' satisfies SaleOutcome, filter, pagination);
        return { ...this.envelope(rows.map((r) => toListItem(r, false)), count, pagination), totalValue: 0, avgValue: 0 };
    }

    reasons(companyId: string) {
        return this.repository.reasonOptions(companyId);
    }

    async channels(companyId: string) {
        return (await this.repository.channels(companyId)).map((channel) => ({ channel }));
    }

    /** RN-CRM-08: marca o ticket como venda (com valor) ou não venda (com motivo da própria empresa). */
    async updateSale(ticketId: number, companyId: string, input: UpdateSaleInput) {
        const reasonId = input.reasonId ?? null;
        if (reasonId !== null && !(await this.repository.reasonExists(reasonId, companyId))) {
            throw new BadRequestError('Motivo não encontrado');
        }
        const updated = await this.repository.updateSale(ticketId, companyId, {
            is_sale: input.isSale ? 1 : 0,
            service_not_made: input.isSale ? 0 : 1,
            sale_price: input.salePrice || '0,00',
            reasons_id: reasonId,
        });
        if (!updated) throw new NotFoundError('Ticket não encontrado');
    }

    private envelope<T>(salesMade: T[], count: number, pagination: Pagination) {
        return { salesMade, count, totalPages: Math.max(1, Math.ceil(count / pagination.limit)), page: pagination.page };
    }
}
