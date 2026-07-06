import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { tarefasController } from './tarefas.controller';

export async function tarefasRoutes(app: FastifyInstance) {
    const auth = { preHandler: authMiddleware };

    // Quadro (Central de Tarefas)
    app.get('/board',              auth, tarefasController.board);
    app.get('/arquivadas',         auth, tarefasController.archived);
    app.get('/contato/:contactId', auth, tarefasController.byContact);

    // Tarefas
    app.post('/',                 auth, tarefasController.create);
    app.put('/:id',               auth, tarefasController.update);
    app.patch('/:id/move',        auth, tarefasController.move);
    app.patch('/:id/concluir',    auth, tarefasController.setDone);
    app.patch('/:id/arquivar',    auth, tarefasController.setArchived);
    app.delete('/:id',            auth, tarefasController.remove);

    // Colunas customizadas
    app.post('/colunas',          auth, tarefasController.createColumn);
    app.put('/colunas/:id',       auth, tarefasController.renameColumn);
    app.delete('/colunas/:id',    auth, tarefasController.deleteColumn);
}
