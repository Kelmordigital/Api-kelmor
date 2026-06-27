import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { campanhaController } from './campanha.controller';

export async function campanhasRoutes(app: FastifyInstance) {
    app.addHook('preHandler', authMiddleware);

    // Literal routes first to avoid conflict with /:id
    app.get('/selects',        campanhaController.getSelects);
    app.get('/texts',          campanhaController.listTexts);
    app.post('/texts',         campanhaController.upsertText);
    app.put('/texts/:id',      campanhaController.updateText);
    app.delete('/texts/:id',   campanhaController.removeText);

    app.get('/',               campanhaController.list);
    app.post('/',              campanhaController.create);
    app.put('/:id',            campanhaController.update);
    app.delete('/:id',         campanhaController.remove);
    app.post('/:id/play',      campanhaController.play);
    app.post('/:id/pause',     campanhaController.pause);
}
