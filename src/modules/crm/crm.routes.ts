import type { FastifyInstance } from 'fastify';
import { authMiddleware, requireAdmin } from '../../middlewares/auth.middleware';
import type { HttpRouter } from '../../core/http/http-router';
import type { CrmConfigController, CrmReportsController, CrmTimelineController } from './crm.controller';

/** Motivos e palavras-chave: qualquer usuário da empresa lê; só admin altera. */
export class CrmConfigRouter implements HttpRouter {
    constructor(private readonly controller: CrmConfigController) {}

    register = async (app: FastifyInstance) => {
        app.addHook('preHandler', authMiddleware);
        const c = this.controller;
        const adminOnly = { preHandler: requireAdmin };

        app.get('/reasons',                   c.listReasons);
        app.post('/reasons',       adminOnly, c.createReason);
        app.put('/reasons/:id',    adminOnly, c.updateReason);
        app.delete('/reasons/:id', adminOnly, c.deleteReason);

        app.get('/keywords',                   c.listKeywords);
        app.post('/keywords',       adminOnly, c.createKeyword);
        app.delete('/keywords/:id', adminOnly, c.deleteKeyword);
    };
}

/** Linha do tempo: ferramenta do vendedor — qualquer usuário da empresa. */
export class CrmTimelineRouter implements HttpRouter {
    constructor(private readonly controller: CrmTimelineController) {}

    register = async (app: FastifyInstance) => {
        app.addHook('preHandler', authMiddleware);
        app.get('/crm/contacts/:contactId/timeline',  this.controller.getTimeline);
        app.post('/crm/contacts/:contactId/timeline', this.controller.addNote);
    };
}

/** Relatórios de venda: só admin. */
export class CrmReportsRouter implements HttpRouter {
    constructor(private readonly controller: CrmReportsController) {}

    register = async (app: FastifyInstance) => {
        app.addHook('preHandler', authMiddleware);
        app.addHook('preHandler', requireAdmin);
        const c = this.controller;

        app.get('/sales-made',      c.salesMade);
        app.get('/sales-not-made',  c.salesNotMade);
        app.get('/reasons-select',  c.reasons);
        app.get('/channels-select', c.channels);
        app.put('/:ticketId',       c.updateSale);
    };
}
