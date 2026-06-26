import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { etiquetaController } from './etiqueta.controller';

export async function etiquetasRoutes(app: FastifyInstance) {
    app.get('/etiquetas',              { preHandler: authMiddleware }, etiquetaController.list);
    app.get('/etiquetas/stats',        { preHandler: authMiddleware }, etiquetaController.stats);
    app.post('/etiquetas',             { preHandler: authMiddleware }, etiquetaController.create);
    app.put('/etiquetas/:id',          { preHandler: authMiddleware }, etiquetaController.update);
    app.delete('/etiquetas/:id',       { preHandler: authMiddleware }, etiquetaController.remove);

    app.get('/contacts/:contactId/etiquetas',                           { preHandler: authMiddleware }, etiquetaController.listDoContato);
    app.post('/contacts/:contactId/etiquetas/:etiquetaId',             { preHandler: authMiddleware }, etiquetaController.aplicarAoContato);
    app.delete('/contacts/:contactId/etiquetas/:etiquetaId',           { preHandler: authMiddleware }, etiquetaController.removerDoContato);
}
