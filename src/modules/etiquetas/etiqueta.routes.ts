import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middlewares/auth.middleware';
import type { HttpRouter } from '../../core/http/http-router';
import type { AutomaticTagRuleController, EtiquetaController } from './etiqueta.controller';

/** Etiquetas, etiquetas do contato e regras automáticas — qualquer usuário autenticado da empresa. */
export class EtiquetaRouter implements HttpRouter {
    constructor(
        private readonly tags: EtiquetaController,
        private readonly rules: AutomaticTagRuleController,
    ) {}

    register = async (app: FastifyInstance) => {
        app.addHook('preHandler', authMiddleware);

        app.get('/etiquetas',          this.tags.list);
        app.get('/etiquetas/stats',    this.tags.stats);
        app.post('/etiquetas',         this.tags.create);
        app.put('/etiquetas/:id',      this.tags.update);
        app.delete('/etiquetas/:id',   this.tags.remove);

        app.get('/contacts/:contactId/etiquetas',                 this.tags.listForContact);
        app.post('/contacts/:contactId/etiquetas/:etiquetaId',    this.tags.applyToContact);
        app.delete('/contacts/:contactId/etiquetas/:etiquetaId',  this.tags.removeFromContact);

        app.get('/etiquetas/regras-automaticas',        this.rules.list);
        app.post('/etiquetas/regras-automaticas',       this.rules.create);
        app.put('/etiquetas/regras-automaticas/:id',    this.rules.update);
        app.delete('/etiquetas/regras-automaticas/:id', this.rules.remove);
    };
}
