import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { reportsController } from './reports.controller';

// Registrado em /api/v1/reports
export async function reportsRoutes(app: FastifyInstance) {
    app.get('/tickets/user',    { preHandler: authMiddleware }, reportsController.getTicketsUser);
    app.get('/ticket/average',  { preHandler: authMiddleware }, reportsController.getAverage);
}

// Registrado em /api/v1/reporttickets
export async function reportTicketsRoutes(app: FastifyInstance) {
    app.get('/tickets/clienttickets', { preHandler: authMiddleware }, reportsController.getClientTickets);
}
