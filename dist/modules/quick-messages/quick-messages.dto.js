"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.quickMessageListQuerySchema = exports.quickMessageIdParamsSchema = exports.QUICK_MESSAGE_PAGINATION = exports.QUICK_MESSAGE_MIME_TYPES = void 0;
exports.quickMessageInputFrom = quickMessageInputFrom;
const zod_1 = require("zod");
exports.QUICK_MESSAGE_MIME_TYPES = new Set([
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'video/mp4', 'audio/mpeg', 'application/pdf',
]);
exports.QUICK_MESSAGE_PAGINATION = { defaultLimit: 10, maxLimit: 50 };
exports.quickMessageIdParamsSchema = zod_1.z.object({
    id: zod_1.z.coerce.number({ error: 'id inválido' }).int('id inválido').positive('id inválido'),
});
exports.quickMessageListQuerySchema = zod_1.z.object({
    page: zod_1.z.unknown().optional(),
    limit: zod_1.z.unknown().optional(),
    search: zod_1.z.string().optional(),
});
function quickMessageInputFrom(form) {
    return {
        title: form.fields.title,
        message: form.fields.message,
        removeMedia: form.fields.remove_media === 'true',
    };
}
//# sourceMappingURL=quick-messages.dto.js.map