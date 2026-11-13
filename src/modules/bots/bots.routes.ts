import type { FastifyInstance } from 'fastify';
import { authMiddleware, requireAdmin } from '../../middlewares/auth.middleware';
import type { HttpRouter } from '../../core/http/http-router';
import type { BotController } from './bots.controller';

/** Automações (bots) — só admin. */
export class BotRouter implements HttpRouter {
    constructor(private readonly controller: BotController) {}

    register = async (app: FastifyInstance) => {
        app.addHook('preHandler', authMiddleware);
        app.addHook('preHandler', requireAdmin);
        const c = this.controller;

        app.get('/',                     c.list);
        app.get('/stats',                c.stats);
        app.post('/',                    c.create);
        app.post('/upload',              c.uploadMedia);
        app.put('/:id',                  c.update);
        app.delete('/:id',               c.remove);
        app.patch('/:id/toggle-active',  c.toggleActive);
        app.patch('/:id/set-default',    c.setDefault);
        app.get('/:id/nodes',            c.getNodes);
        app.post('/:id/nodes/sync',      c.syncNodes);
        app.get('/:id/nodes/:nodeId/rotate-report', c.rotateReport);
    };
}
