import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { crmTimelineController } from './crm-timeline.controller';

// Qualquer usuário autenticado da empresa — não é requireAdmin, é ferramenta
// de vendedor comum (ver docs/superpowers/specs/2026-07-27-timeline-lead-design.md).
export async function crmTimelineRoutes(app: FastifyInstance) {
    app.addHook('preHandler', authMiddleware);

    app.get('/crm/contacts/:contactId/timeline', crmTimelineController.getTimeline);
    app.post('/crm/contacts/:contactId/timeline', crmTimelineController.addNote);
}
