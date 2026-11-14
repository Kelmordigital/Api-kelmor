import { describe, it, expect, vi } from 'vitest';
import { SalePrice } from '../../src/modules/crm/sale-price';
import { originOf } from '../../src/modules/crm/crm-config.service';
import { deriveTicketEvent } from '../../src/modules/crm/crm-timeline.service';
import { SalesReportService } from '../../src/modules/crm/crm-reports.service';
import type { OriginKeyword, SalesReportRepository } from '../../src/modules/crm/crm.repository';
import { Pagination } from '../../src/core/http/pagination';
import { BadRequestError, NotFoundError } from '../../src/core/errors/http-errors';

describe('SalePrice', () => {
    it('aceita o formato brasileiro; recusa o ambíguo e o inválido', () => {
        for (const ok of ['150', '1.500', '1.500,00', '99,9', '1.234.567,89', '0,50']) expect(SalePrice.isValid(ok), ok).toBe(true);
        for (const bad of ['150.50', '1,500.00', 'abc', '10,999', '1.50', '', '12.3456']) expect(SalePrice.isValid(bad), bad).toBe(false);
    });

    it('converte para número (vazio = 0)', () => {
        expect(SalePrice.toNumber('1.500,25')).toBe(1500.25);
        expect(SalePrice.toNumber('150')).toBe(150);
        expect(SalePrice.toNumber(null)).toBe(0);
    });
});

describe('Origem por palavra-chave', () => {
    const kw = (keyword: string, origin: string) => ({ keyword, origin }) as OriginKeyword;

    it('a primeira palavra cadastrada contida na mensagem vence, sem diferenciar maiúsculas', () => {
        const list = [kw('instagram', 'Instagram'), kw('vim do site', 'Site')];
        expect(originOf(list, 'VIM DO SITE e do Instagram')).toBe('Instagram');
        expect(originOf(list, 'Vim do site')).toBe('Site');
        expect(originOf(list, 'oi')).toBeNull();
    });
});

describe('Linha do tempo', () => {
    it('traduz transições de status em eventos', () => {
        expect(deriveTicketEvent(9, 2)).toBe('accepted');
        expect(deriveTicketEvent(2, 2)).toBe('transferred');
        expect(deriveTicketEvent(3, 2)).toBe('reopened');
        expect(deriveTicketEvent(2, 1)).toBe('returned_to_queue');
        expect(deriveTicketEvent(2, 3)).toBe('closed');
        expect(deriveTicketEvent(1, 7)).toBe('status_changed');
    });
});

describe('SalesReportService', () => {
    const pagination = Pagination.fromQuery({ page: 1, limit: 10 }, { defaultLimit: 10, maxLimit: 100 });
    const make = (over: Partial<SalesReportRepository> = {}) => {
        const repo = {
            page: vi.fn(async () => ({ rows: [], count: 0 })),
            prices: vi.fn(async () => ['1.000,00', '500,50', null, 'lixo']),
            reasonExists: vi.fn(async () => true),
            updateSale: vi.fn(async () => true),
            ...over,
        } as unknown as SalesReportRepository;
        return { repo, service: new SalesReportService(repo) };
    };

    it('total e média contam todas as vendas do filtro (valor inválido conta como zero)', async () => {
        const res = await make().service.salesMade('c', {}, pagination);
        expect(res).toMatchObject({ totalValue: 1500.5, avgValue: 375.125, totalPages: 1, page: 1 });
    });

    it('não venda: grava o motivo; venda sem valor: "0,00"', async () => {
        const { service, repo } = make();
        await service.updateSale(1, 'c', { isSale: false, reasonId: 5 });
        expect(repo.updateSale).toHaveBeenLastCalledWith(1, 'c', { is_sale: 0, service_not_made: 1, sale_price: '0,00', reasons_id: 5 });
        await service.updateSale(1, 'c', { isSale: true, salePrice: '10,00' });
        expect(repo.updateSale).toHaveBeenLastCalledWith(1, 'c', { is_sale: 1, service_not_made: 0, sale_price: '10,00', reasons_id: null });
    });

    it('motivo de outra empresa → 400 sem gravar; ticket de outra empresa → 404', async () => {
        const foreign = make({ reasonExists: vi.fn(async () => false) });
        await expect(foreign.service.updateSale(1, 'c', { isSale: false, reasonId: 9 })).rejects.toEqual(new BadRequestError('Motivo não encontrado'));
        expect(foreign.repo.updateSale).not.toHaveBeenCalled();

        await expect(make({ updateSale: vi.fn(async () => false) }).service.updateSale(1, 'c', { isSale: true }))
            .rejects.toEqual(new NotFoundError('Ticket não encontrado'));
    });
});
