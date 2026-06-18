"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRoutes = authRoutes;
const auth_controller_1 = require("./auth.controller");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
async function authRoutes(app) {
    app.post('/register', { preHandler: auth_middleware_1.adminMiddleware }, auth_controller_1.authController.register);
    app.post('/login', auth_controller_1.authController.login);
    app.post('/refresh', auth_controller_1.authController.refresh);
    app.delete('/logout', auth_controller_1.authController.logout);
    app.get('/me', { preHandler: auth_middleware_1.authMiddleware }, auth_controller_1.authController.me);
}
//# sourceMappingURL=auth.routes.js.map