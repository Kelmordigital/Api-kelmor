import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { agendaController } from './agenda.controller';

export async function agendaRoutes(app: FastifyInstance) {
    app.get('/',       { preHandler: authMiddleware }, agendaController.list);
    app.post('/',      { preHandler: authMiddleware }, agendaController.create);
    app.put('/:id',    { preHandler: authMiddleware }, agendaController.update);
    app.delete('/:id', { preHandler: authMiddleware }, agendaController.remove);
}
