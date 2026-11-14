import type { Pagination } from '../../core/http/pagination';
import type { ExportedFile, ExportFormat, TableColumn, TableExporter, TableHeading } from '../../core/export/table-export';
import type { AverageFilter, AverageRow, ClientTicketsRow, Period, ReportsRepository, UserTicketsRow } from './reports.repository';

/** RN-REL-01: os relatórios por usuário e de tempo médio só olham os últimos 90 dias. */
export const REPORT_RETENTION_DAYS = 90;
/** RN-REL-04: o gráfico de tempo médio mostra a última semana. */
export const AVERAGE_GRAPH_DAYS = 7;

export interface ClientReport {
    items: ClientTicketsRow[];
    count: number;
    pages: number;
}

/** Dia AAAA-MM-DD no início (00:00:00) ou no fim (23:59:59) — no fuso do servidor. */
function startOfDay(ymd: string): Date { return new Date(`${ymd}T00:00:00`); }
function endOfDay(ymd: string): Date { return new Date(`${ymd}T23:59:59`); }
const brDate = (ymd: string) => ymd.split('-').reverse().join('/');

/** Subtítulo do arquivo exportado com o período pedido. */
export function periodLabel(start: string | undefined, end: string | undefined, whenEmpty: string): string {
    if (start && end) return `Período: ${brDate(start)} a ${brDate(end)}`;
    if (start) return `A partir de ${brDate(start)}`;
    if (end) return `Até ${brDate(end)}`;
    return whenEmpty;
}

const USER_COLUMNS: TableColumn[] = [
    { header: 'Nome do Atendente', key: 'name', width: 35 },
    { header: 'Tickets Encerrados', key: 'total_tickets', width: 20 },
];
const CLIENT_COLUMNS: TableColumn[] = [
    { header: 'Cliente', key: 'client', width: 35 },
    { header: 'Número', key: 'number', width: 20 },
    { header: 'Total de Atendimentos', key: 'ticket_count', width: 25 },
];
const AVERAGE_COLUMNS: TableColumn[] = [
    { header: 'Dia', key: 'day', width: 18 },
    { header: 'Tempo para Atender', key: 'label_opened', width: 22 },
    { header: 'Tempo em Atendimento', key: 'label_closed', width: 25 },
];

/** Relatórios de atendimento: por usuário, por cliente e tempo médio. */
export class ReportsService {
    private readonly exporters: Map<ExportFormat, TableExporter>;

    constructor(
        private readonly repository: ReportsRepository,
        exporters: TableExporter[],
        private readonly now: () => Date = () => new Date(),
    ) {
        this.exporters = new Map(exporters.map((e) => [e.format, e]));
    }

    // ── Por usuário ──────────────────────────────────────────────────────────

    /** RN-REL-02. */
    ticketsByUser(companyId: string, dateStart?: string, dateEnd?: string): Promise<UserTicketsRow[]> {
        const floor = new Date(this.now().getTime() - REPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
        const asked = dateStart ? startOfDay(dateStart) : undefined;
        const from = asked && asked > floor ? asked : floor;
        return this.repository.ticketsByUser(companyId, { from, to: dateEnd ? endOfDay(dateEnd) : undefined });
    }

    /** RN-REL-05. */
    async ticketsByUserFile(companyId: string, format: ExportFormat, dateStart?: string, dateEnd?: string): Promise<ExportedFile> {
        const heading = { title: 'Usuários', subtitle: periodLabel(dateStart, dateEnd, `Últimos ${REPORT_RETENTION_DAYS} dias`) };
        return this.export(format, heading, USER_COLUMNS, await this.ticketsByUser(companyId, dateStart, dateEnd));
    }

    // ── Por cliente ──────────────────────────────────────────────────────────

    /** RN-REL-03. */
    async ticketsByClient(companyId: string, dateStart: string | undefined, dateEnd: string | undefined, pagination: Pagination): Promise<ClientReport> {
        const { items, count } = await this.repository.ticketsByClient(companyId, this.clientPeriod(dateStart, dateEnd), pagination);
        return { items, count, pages: Math.max(1, Math.ceil(count / pagination.limit)) };
    }

    /** RN-REL-05: todos os clientes, sem paginação. */
    async ticketsByClientFile(companyId: string, format: ExportFormat, dateStart?: string, dateEnd?: string): Promise<ExportedFile> {
        const { items } = await this.repository.ticketsByClient(companyId, this.clientPeriod(dateStart, dateEnd));
        return this.export(format, { title: 'Clientes', subtitle: periodLabel(dateStart, dateEnd, 'Hoje') }, CLIENT_COLUMNS, items);
    }

    // ── Tempo médio ──────────────────────────────────────────────────────────

    /** RN-REL-04: `graph` troca o período pela última semana e traz todos os dias. */
    averageTimes(companyId: string, filter: AverageFilter, graph: boolean, pagination: Pagination): Promise<AverageRow[]> {
        if (graph) return this.repository.averageTimes(companyId, { ...filter, lastDays: AVERAGE_GRAPH_DAYS }, REPORT_RETENTION_DAYS);
        return this.repository.averageTimes(companyId, filter, REPORT_RETENTION_DAYS, pagination);
    }

    /** RN-REL-05: todos os dias, sem paginação. */
    async averageTimesFile(companyId: string, format: ExportFormat, filter: AverageFilter): Promise<ExportedFile> {
        const rows = await this.repository.averageTimes(companyId, filter, REPORT_RETENTION_DAYS);
        const heading = { title: 'Tempo Médio', subtitle: periodLabel(filter.dateInit, filter.dateEnd, `Últimos ${REPORT_RETENTION_DAYS} dias`) };
        return this.export(format, heading, AVERAGE_COLUMNS, rows);
    }

    private export(format: ExportFormat, heading: TableHeading, columns: TableColumn[], rows: object[]): Promise<ExportedFile> {
        const exporter = this.exporters.get(format);
        if (!exporter) throw new Error(`Formato de exportação não configurado: ${format}`);
        return exporter.export(heading, columns, rows);
    }

    /** Sem período informado, o relatório por cliente mostra o dia de hoje. */
    private clientPeriod(dateStart?: string, dateEnd?: string): Period {
        const today = this.now();
        const from = dateStart ? startOfDay(dateStart) : new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
        const to = dateEnd ? endOfDay(dateEnd) : new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
        return { from, to };
    }
}
