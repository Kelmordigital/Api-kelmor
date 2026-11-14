import type { FastifyReply, FastifyRequest } from 'fastify';
import { SchemaValidator } from '../../core/validation/schema-validator';
import { requireCompanyId } from '../../core/http/http-router';
import { Pagination } from '../../core/http/pagination';
import type { ExportedFile, ExportFormat } from '../../core/export/table-export';
import {
    AVERAGE_REPORT_PAGINATION, CLIENT_REPORT_PAGINATION,
    averageReportQuerySchema, clientReportQuerySchema, usersReportQuerySchema,
} from './reports.dto';
import type { ReportsService } from './reports.service';

/** `pdf=true` → PDF; `excel=true` → planilha; nenhum → JSON. */
function formatOf(q: { pdf: boolean; excel: boolean }): ExportFormat | null {
    if (q.pdf) return 'pdf';
    if (q.excel) return 'xlsx';
    return null;
}

function download(reply: FastifyReply, name: string, file: ExportedFile) {
    return reply
        .header('Content-Type', file.contentType)
        .header('Content-Disposition', `attachment; filename="${name}.${file.extension}"`)
        .send(file.content);
}

export class ReportsController {
    constructor(private readonly service: ReportsService) {}

    /** GET /reports/tickets/user */
    ticketsByUser = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = requireCompanyId(req);
        const q = SchemaValidator.parse(usersReportQuerySchema, req.query);
        const format = formatOf(q);
        if (format) return download(reply, 'relatorio_usuarios', await this.service.ticketsByUserFile(companyId, format, q.dateStartParam, q.dateEndParam));
        return reply.send(await this.service.ticketsByUser(companyId, q.dateStartParam, q.dateEndParam));
    };

    /** GET /reporttickets/tickets/clienttickets */
    ticketsByClient = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = requireCompanyId(req);
        const q = SchemaValidator.parse(clientReportQuerySchema, req.query);
        const format = formatOf(q);
        if (format) return download(reply, 'relatorio_clientes', await this.service.ticketsByClientFile(companyId, format, q.dateStartParam, q.dateEndParam));
        const pagination = Pagination.fromQuery(q, CLIENT_REPORT_PAGINATION);
        return reply.send(await this.service.ticketsByClient(companyId, q.dateStartParam, q.dateEndParam, pagination));
    };

    /** GET /reports/ticket/average */
    averageTimes = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = requireCompanyId(req);
        const { graph, excel, pdf, page, limit, ...filter } = SchemaValidator.parse(averageReportQuerySchema, req.query);
        const format = formatOf({ excel, pdf });
        if (format) return download(reply, 'relatorio_tempo_medio', await this.service.averageTimesFile(companyId, format, filter));
        const pagination = Pagination.fromQuery({ page, limit }, AVERAGE_REPORT_PAGINATION);
        return reply.send(await this.service.averageTimes(companyId, filter, graph, pagination));
    };
}
