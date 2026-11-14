import { describe, it, expect, vi } from 'vitest';
import { ReportsService, periodLabel } from '../../src/modules/reports/reports.service';
import type { ReportsRepository } from '../../src/modules/reports/reports.repository';
import type { ExportFormat, TableExporter } from '../../src/core/export/table-export';
import { PdfTableWriter } from '../../src/core/export/pdf-table';
import { Pagination } from '../../src/core/http/pagination';
import { AVERAGE_REPORT_PAGINATION, CLIENT_REPORT_PAGINATION } from '../../src/modules/reports/reports.dto';

const NOW = new Date(2026, 10, 14, 15, 30); // 14/11/2026 15:30 (fuso local)

function make() {
    const repo = {
        ticketsByUser: vi.fn(async () => [{ id: 'u', name: 'Bia', total_tickets: 2 }]),
        ticketsByClient: vi.fn(async () => ({ items: [{ client: 'Ana', number: '1', ticket_count: 3 }], count: 41 })),
        averageTimes: vi.fn(async () => []),
    } satisfies ReportsRepository;
    const exporter = (format: ExportFormat) => ({
        format,
        export: vi.fn(async () => ({ content: Buffer.from(format), contentType: format, extension: format })),
    }) satisfies TableExporter;
    const xlsx = exporter('xlsx');
    const pdf = exporter('pdf');
    return { repo, xlsx, pdf, service: new ReportsService(repo, [xlsx, pdf], () => NOW) };
}

describe('Relatório por usuário', () => {
    it('nunca olha além de 90 dias, mesmo se o início pedido for anterior', async () => {
        const { service, repo } = make();
        const floor = new Date(NOW.getTime() - 90 * 24 * 60 * 60 * 1000);

        await service.ticketsByUser('c');
        expect(repo.ticketsByUser).toHaveBeenLastCalledWith('c', { from: floor, to: undefined });

        await service.ticketsByUser('c', '2020-01-01', '2026-11-10');
        expect(repo.ticketsByUser).toHaveBeenLastCalledWith('c', { from: floor, to: new Date('2026-11-10T23:59:59') });

        await service.ticketsByUser('c', '2026-11-01');
        expect(repo.ticketsByUser).toHaveBeenLastCalledWith('c', { from: new Date('2026-11-01T00:00:00'), to: undefined });
    });
});

describe('Relatório por cliente', () => {
    const pagination = Pagination.fromQuery({ page: 2 }, CLIENT_REPORT_PAGINATION);

    it('sem período, mostra o dia de hoje; calcula o total de páginas', async () => {
        const { service, repo } = make();
        const res = await service.ticketsByClient('c', undefined, undefined, pagination);
        expect(repo.ticketsByClient).toHaveBeenCalledWith('c', {
            from: new Date(2026, 10, 14, 0, 0, 0, 0), to: new Date(2026, 10, 14, 23, 59, 59, 999),
        }, pagination);
        expect(res).toMatchObject({ count: 41, pages: 3 });
    });

    it('sem resultados ainda tem 1 página', async () => {
        const { service, repo } = make();
        repo.ticketsByClient.mockResolvedValueOnce({ items: [], count: 0 });
        expect((await service.ticketsByClient('c', '2026-01-01', '2026-01-31', pagination)).pages).toBe(1);
    });

    it('o arquivo traz todos os clientes, com o número, no formato pedido', async () => {
        const { service, repo, xlsx, pdf } = make();
        const file = await service.ticketsByClientFile('c', 'pdf', '2026-01-01', '2026-01-31');
        expect(file.extension).toBe('pdf');
        expect(xlsx.export).not.toHaveBeenCalled();
        expect(repo.ticketsByClient.mock.calls[0]).toHaveLength(2);
        const [heading, columns] = pdf.export.mock.calls[0] as unknown as Parameters<TableExporter['export']>;
        expect(heading).toEqual({ title: 'Clientes', subtitle: 'Período: 01/01/2026 a 31/01/2026' });
        expect(columns.map((c) => c.key)).toEqual(['client', 'number', 'ticket_count']);
    });
});

describe('Tempo médio', () => {
    const pagination = Pagination.fromQuery({}, AVERAGE_REPORT_PAGINATION);

    it('o gráfico pede a última semana, sem paginação; a tabela usa o período e a paginação', async () => {
        const { service, repo } = make();
        await service.averageTimes('c', { dateInit: '2026-10-01', queueId: 3 }, true, pagination);
        expect(repo.averageTimes).toHaveBeenLastCalledWith('c', { dateInit: '2026-10-01', queueId: 3, lastDays: 7 }, 90);

        await service.averageTimes('c', { dateInit: '2026-10-01' }, false, pagination);
        expect(repo.averageTimes).toHaveBeenLastCalledWith('c', { dateInit: '2026-10-01' }, 90, pagination);
        expect(pagination.limit).toBe(100);
    });

    it('o arquivo traz todos os dias', async () => {
        const { service, repo, xlsx } = make();
        await service.averageTimesFile('c', 'xlsx', { userId: 'u' });
        expect(repo.averageTimes).toHaveBeenCalledWith('c', { userId: 'u' }, 90);
        expect(xlsx.export).toHaveBeenCalledWith({ title: 'Tempo Médio', subtitle: 'Últimos 90 dias' }, expect.any(Array), []);
    });
});

describe('Subtítulo com o período', () => {
    it('descreve o período pedido em datas brasileiras', () => {
        expect(periodLabel('2026-10-01', '2026-10-31', 'Hoje')).toBe('Período: 01/10/2026 a 31/10/2026');
        expect(periodLabel('2026-10-01', undefined, 'Hoje')).toBe('A partir de 01/10/2026');
        expect(periodLabel(undefined, '2026-10-31', 'Hoje')).toBe('Até 31/10/2026');
        expect(periodLabel(undefined, undefined, 'Hoje')).toBe('Hoje');
    });
});

describe('PdfTableWriter', () => {
    /** Texto de cada linha desenhada (o pdfkit grava em hexadecimal WinAnsi, partido pelo kerning). */
    const textOf = (pdf: Buffer) => [...pdf.toString('latin1').matchAll(/\[([^\]]*)\] TJ/g)]
        .map((m) => [...m[1].matchAll(/<([0-9a-f]*)>/g)].map((h) => Buffer.from(h[1], 'hex').toString('latin1')).join(''));
    const pagesOf = (pdf: Buffer) => pdf.toString('latin1').match(/\/Type \/Page\b/g)?.length ?? 0;
    const columns = [{ header: 'Cliente', key: 'client', width: 35 }, { header: 'Total', key: 'total', width: 20 }];
    const writer = new PdfTableWriter({ compress: false });

    it('gera um PDF com título, subtítulo, cabeçalho e linhas (acentos incluídos)', async () => {
        const file = await writer.export(
            { title: 'Clientes', subtitle: 'Período: 01/10/2026 a 31/10/2026' }, columns, [{ client: 'João Ângelo', total: 3 }, { client: null, total: 0 }],
        );
        expect(file.contentType).toBe('application/pdf');
        expect(file.extension).toBe('pdf');
        expect(file.content.toString('latin1').startsWith('%PDF-')).toBe(true);
        expect(textOf(file.content)).toEqual([
            'Clientes', 'Período: 01/10/2026 a 31/10/2026', 'Cliente', 'Total', 'João Ângelo', '3', '', '0', 'Página 1 de 1',
        ].filter(Boolean));
    });

    it('quebra em várias páginas e repete o cabeçalho', async () => {
        const rows = Array.from({ length: 120 }, (_, i) => ({ client: `Cliente ${i}`, total: i }));
        const file = await writer.export({ title: 'Clientes' }, columns, rows);
        const pages = pagesOf(file.content);
        const text = textOf(file.content);
        expect(pages).toBeGreaterThan(1);
        expect(text.filter((t) => t === 'Total')).toHaveLength(pages); // cabeçalho em cada página
        expect(text).toContain(`Página ${pages} de ${pages}`);
        expect(text).toContain('Cliente 119');
    });

    it('sem linhas, avisa que não há registros', async () => {
        expect(textOf((await writer.export({ title: 'Vazio' }, columns, [])).content)).toContain('Nenhum registro no período.');
    });
});
