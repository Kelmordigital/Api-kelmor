import { FastifyRequest, FastifyReply } from 'fastify';
declare module 'fastify' {
    interface FastifyRequest {
        user: {
            id: string;
            email: string;
            company_id: string | null;
            profile_tag: string;
            finance: boolean;
        };
    }
}
export declare function authMiddleware(req: FastifyRequest, reply: FastifyReply): Promise<undefined>;
export declare function adminMiddleware(req: FastifyRequest, reply: FastifyReply): Promise<undefined>;
//# sourceMappingURL=auth.middleware.d.ts.map