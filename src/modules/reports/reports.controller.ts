import { FastifyRequest, FastifyReply } from 'fastify';
import { reportsService } from './reports.service';

export const reportsController = {
    // GET /api/v1/reports/tickets/user
    async getTicketsUser(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id;
        if (!companyId) return reply.status(403).send({ error: 'Empresa não encontrada' });

        const { dateStartParam, dateEndParam, excel } = req.query as {
            dateStartParam?: string;
            dateEndParam?: string;
            excel?: string;
        };

        if (excel === 'true') {
            const buffer = await reportsService.exportTicketsUserExcel(companyId, dateStartParam, dateEndParam);
            return reply
                .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
                .header('Content-Disposition', 'attachment; filename="relatorio_usuarios.xlsx"')
                .send(buffer);
        }

        const data = await reportsService.getTicketsUser(companyId, dateStartParam, dateEndParam);
        return reply.send(data);
    },

    // GET /api/v1/reports/ticket/average
    async getAverage(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id;
        if (!companyId) return reply.status(403).send({ error: 'Empresa não encontrada' });

        const { dateInit, dateEnd, queueId, userId, connectionId, page, limit, graph, excel, pdf } =
            req.query as Record<string, string>;

        const params = {
            dateInit,
            dateEnd,
            queueId:      queueId      ? Number(queueId)      : undefined,
            userId:       userId       ?? undefined,
            connectionId: connectionId ? Number(connectionId) : undefined,
            page:         page         ? Number(page)         : 1,
            limit:        limit        ? Number(limit)        : 20,
            graph:        graph === 'true',
        };

        if (excel === 'true' || pdf === 'true') {
            const buffer = await reportsService.exportAverageExcel(companyId, params);
            return reply
                .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
                .header('Content-Disposition', 'attachment; filename="relatorio_tempo_medio.xlsx"')
                .send(buffer);
        }

        const data = await reportsService.getAverage(companyId, params);
        return reply.send(data);
    },

    // GET /api/v1/reporttickets/tickets/clienttickets
    async getClientTickets(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id;
        if (!companyId) return reply.status(403).send({ error: 'Empresa não encontrada' });

        const { dateStartParam, dateEndParam, page, limit, excel, pdf } = req.query as {
            dateStartParam?: string;
            dateEndParam?: string;
            page?: string;
            limit?: string;
            excel?: string;
            pdf?: string;
        };

        if (excel === 'true' || pdf === 'true') {
            const buffer = await reportsService.exportClientTicketsExcel(companyId, dateStartParam, dateEndParam);
            return reply
                .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
                .header('Content-Disposition', 'attachment; filename="relatorio_clientes.xlsx"')
                .send(buffer);
        }

        const data = await reportsService.getClientTickets(
            companyId,
            dateStartParam,
            dateEndParam,
            page  ? Number(page)  : 1,
            limit ? Number(limit) : 20,
        );
        return reply.send(data);
    },
};
