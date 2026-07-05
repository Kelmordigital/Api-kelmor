"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.campanhasRoutes = campanhasRoutes;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const campanha_controller_1 = require("./campanha.controller");
async function campanhasRoutes(app) {
    app.addHook('preHandler', auth_middleware_1.authMiddleware);
    // Literal routes first to avoid conflict with /:id
    app.get('/selects', campanha_controller_1.campanhaController.getSelects);
    app.get('/texts', campanha_controller_1.campanhaController.listTexts);
    app.post('/texts', campanha_controller_1.campanhaController.upsertText);
    app.put('/texts/:id', campanha_controller_1.campanhaController.updateText);
    app.delete('/texts/:id', campanha_controller_1.campanhaController.removeText);
    app.get('/', campanha_controller_1.campanhaController.list);
    app.post('/', campanha_controller_1.campanhaController.create);
    app.put('/:id', campanha_controller_1.campanhaController.update);
    app.delete('/:id', campanha_controller_1.campanhaController.remove);
    app.post('/:id/play', campanha_controller_1.campanhaController.play);
    app.post('/:id/pause', campanha_controller_1.campanhaController.pause);
}
//# sourceMappingURL=campanha.routes.js.map