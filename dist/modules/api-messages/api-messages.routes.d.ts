import type { FastifyInstance } from 'fastify';
import type { HttpRouter } from '../../core/http/http-router';
import type { ApiMessagesController } from './api-messages.controller';
export declare class ApiMessagesRouter implements HttpRouter {
    private readonly controller;
    constructor(controller: ApiMessagesController);
    register: (app: FastifyInstance) => Promise<void>;
}
//# sourceMappingURL=api-messages.routes.d.ts.map