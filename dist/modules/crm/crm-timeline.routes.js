"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.crmTimelineRoutes = crmTimelineRoutes;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const crm_timeline_controller_1 = require("./crm-timeline.controller");
// Qualquer usuário autenticado da empresa — não é requireAdmin, é ferramenta
// de vendedor comum (ver docs/superpowers/specs/2026-07-27-timeline-lead-design.md).
async function crmTimelineRoutes(app) {
    app.addHook('preHandler', auth_middleware_1.authMiddleware);
    app.get('/crm/contacts/:contactId/timeline', crm_timeline_controller_1.crmTimelineController.getTimeline);
    app.post('/crm/contacts/:contactId/timeline', crm_timeline_controller_1.crmTimelineController.addNote);
}
//# sourceMappingURL=crm-timeline.routes.js.map