"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.internalAuthMiddleware = internalAuthMiddleware;
const env_1 = require("../config/env");
async function internalAuthMiddleware(request, reply) {
    const secret = request.headers['x-internal-secret'];
    if (!secret || secret !== env_1.env.INTERNAL_API_SECRET) {
        return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid internal secret' });
    }
}
//# sourceMappingURL=internal-auth.middleware.js.map