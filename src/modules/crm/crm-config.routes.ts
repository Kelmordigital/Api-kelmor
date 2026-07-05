import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { crmConfigController } from './crm-config.controller';

export async function crmConfigRoutes(app: FastifyInstance) {
    const auth = { preHandler: authMiddleware };

    app.get('/reasons',        auth, crmConfigController.listReasons);
    app.post('/reasons',       auth, crmConfigController.createReason);
    app.put('/reasons/:id',    auth, crmConfigController.updateReason);
    app.delete('/reasons/:id', auth, crmConfigController.deleteReason);

    app.get('/keywords',        auth, crmConfigController.listKeywords);
    app.post('/keywords',       auth, crmConfigController.createKeyword);
    app.delete('/keywords/:id', auth, crmConfigController.deleteKeyword);
}
