import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { etiquetaController } from './etiqueta.controller';
import { automaticTagRuleController } from './automatic-tag-rule.controller';

export async function etiquetasRoutes(app: FastifyInstance) {
    app.get('/etiquetas',              { preHandler: authMiddleware }, etiquetaController.list);
    app.get('/etiquetas/stats',        { preHandler: authMiddleware }, etiquetaController.stats);
    app.post('/etiquetas',             { preHandler: authMiddleware }, etiquetaController.create);
    app.put('/etiquetas/:id',          { preHandler: authMiddleware }, etiquetaController.update);
    app.delete('/etiquetas/:id',       { preHandler: authMiddleware }, etiquetaController.remove);

    app.get('/contacts/:contactId/etiquetas',                           { preHandler: authMiddleware }, etiquetaController.listDoContato);
    app.post('/contacts/:contactId/etiquetas/:etiquetaId',             { preHandler: authMiddleware }, etiquetaController.aplicarAoContato);
    app.delete('/contacts/:contactId/etiquetas/:etiquetaId',           { preHandler: authMiddleware }, etiquetaController.removerDoContato);

    app.get('/etiquetas/regras-automaticas',        { preHandler: authMiddleware }, automaticTagRuleController.list);
    app.post('/etiquetas/regras-automaticas',       { preHandler: authMiddleware }, automaticTagRuleController.create);
    app.put('/etiquetas/regras-automaticas/:id',    { preHandler: authMiddleware }, automaticTagRuleController.update);
    app.delete('/etiquetas/regras-automaticas/:id', { preHandler: authMiddleware }, automaticTagRuleController.remove);
}
