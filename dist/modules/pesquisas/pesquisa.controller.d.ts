import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ResearchCatalogService, ResearchReportService } from './pesquisa.service';
/** Adapta HTTP ⇄ cadastro e relatório de pesquisas. */
export declare class PesquisaController {
    private readonly catalog;
    private readonly reports;
    constructor(catalog: ResearchCatalogService, reports: ResearchReportService);
    list: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    listActive: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    create: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    update: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    remove: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    report: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    reportView: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
}
//# sourceMappingURL=pesquisa.controller.d.ts.map