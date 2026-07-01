import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { crmReportsController } from './crm-reports.controller';

export async function crmReportsRoutes(app: FastifyInstance) {
    const auth = { preHandler: authMiddleware };
    app.get('/sales-made',      auth, crmReportsController.salesMade);
    app.get('/sales-not-made',  auth, crmReportsController.salesNotMade);
    app.get('/reasons-select',  auth, crmReportsController.reasons);
    app.get('/channels-select', auth, crmReportsController.channels);
    app.put('/:ticketId',       auth, crmReportsController.updateSale);
}