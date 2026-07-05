"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.produtosRoutes = produtosRoutes;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const produto_controller_1 = require("./produto.controller");
async function produtosRoutes(app) {
    app.get('/', { preHandler: auth_middleware_1.authMiddleware }, produto_controller_1.produtoController.list);
    app.get('/:id', { preHandler: auth_middleware_1.authMiddleware }, produto_controller_1.produtoController.findById);
    app.post('/', { preHandler: auth_middleware_1.authMiddleware }, produto_controller_1.produtoController.create);
    app.put('/:id', { preHandler: auth_middleware_1.authMiddleware }, produto_controller_1.produtoController.update);
    app.delete('/:id', { preHandler: auth_middleware_1.authMiddleware }, produto_controller_1.produtoController.remove);
}
//# sourceMappingURL=produto.routes.js.map