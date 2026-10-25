"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EtiquetaRouter = void 0;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
/** Etiquetas, etiquetas do contato e regras automáticas — qualquer usuário autenticado da empresa. */
class EtiquetaRouter {
    tags;
    rules;
    constructor(tags, rules) {
        this.tags = tags;
        this.rules = rules;
    }
    register = async (app) => {
        app.addHook('preHandler', auth_middleware_1.authMiddleware);
        app.get('/etiquetas', this.tags.list);
        app.get('/etiquetas/stats', this.tags.stats);
        app.post('/etiquetas', this.tags.create);
        app.put('/etiquetas/:id', this.tags.update);
        app.delete('/etiquetas/:id', this.tags.remove);
        app.get('/contacts/:contactId/etiquetas', this.tags.listForContact);
        app.post('/contacts/:contactId/etiquetas/:etiquetaId', this.tags.applyToContact);
        app.delete('/contacts/:contactId/etiquetas/:etiquetaId', this.tags.removeFromContact);
        app.get('/etiquetas/regras-automaticas', this.rules.list);
        app.post('/etiquetas/regras-automaticas', this.rules.create);
        app.put('/etiquetas/regras-automaticas/:id', this.rules.update);
        app.delete('/etiquetas/regras-automaticas/:id', this.rules.remove);
    };
}
exports.EtiquetaRouter = EtiquetaRouter;
//# sourceMappingURL=etiqueta.routes.js.map