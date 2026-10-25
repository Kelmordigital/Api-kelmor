import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middlewares/auth.middleware';
import type { HttpRouter } from '../../core/http/http-router';
import type { TarefasController } from './tarefas.controller';

/** Central de Tarefas — qualquer usuário autenticado, sobre o próprio quadro. */
export class TarefasRouter implements HttpRouter {
    constructor(private readonly controller: TarefasController) {}

    register = async (app: FastifyInstance) => {
        app.addHook('preHandler', authMiddleware);
        const c = this.controller;

        // Quadro (Central de Tarefas)
        app.get('/board',              c.board);
        app.get('/arquivadas',         c.archived);
        app.get('/contato/:contactId', c.byContact);

        // Tarefas
        app.post('/',              c.create);
        app.put('/:id',            c.update);
        app.patch('/:id/move',     c.move);
        app.patch('/:id/concluir', c.setDone);
        app.patch('/:id/arquivar', c.setArchived);
        app.delete('/:id',         c.remove);

        // Colunas customizadas
        app.post('/colunas',       c.createColumn);
        app.put('/colunas/:id',    c.renameColumn);
        app.delete('/colunas/:id', c.deleteColumn);
    };
}
