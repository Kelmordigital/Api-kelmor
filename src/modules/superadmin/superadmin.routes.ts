import { FastifyInstance } from 'fastify';
import { authMiddleware, requireSuperAdmin } from '../../middlewares/auth.middleware';
import { superadminController } from './superadmin.controller';

export async function superadminRoutes(app: FastifyInstance) {
    const guard = { preHandler: [authMiddleware, requireSuperAdmin] };

    app.get('/stats',     guard, superadminController.stats);
    app.get('/companies', guard, superadminController.listCompanies);
    app.post('/companies',              guard, superadminController.createCompany);
    app.patch('/companies/:id',         guard, superadminController.updateCompany);
    app.patch('/companies/:id/status',  guard, superadminController.setCompanyStatus);
    app.patch('/users/:id/approve', guard, superadminController.approveUser);
    app.patch('/users/:id/revoke',  guard, superadminController.revokeUser);
}
