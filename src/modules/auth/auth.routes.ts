import { FastifyInstance } from 'fastify';
import { authController } from './auth.controller';
import { adminMiddleware, authMiddleware, requireSuperAdmin } from '../../middlewares/auth.middleware';

export async function authRoutes(app: FastifyInstance) {
    app.post('/register', { preHandler: adminMiddleware }, authController.register);
    app.post('/login', authController.login);
    app.post('/refresh', authController.refresh);
    app.delete('/logout', authController.logout);
    app.get('/me', { preHandler: authMiddleware }, authController.me);
    app.patch('/approve/:id', { preHandler: [authMiddleware, requireSuperAdmin] }, authController.approve);
}
