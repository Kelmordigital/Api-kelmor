import { FastifyRequest, FastifyReply } from 'fastify';
export declare const authController: {
    login(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    loginTotp(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    me(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    register(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    refresh(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    logout(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    approve(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    totpSetup(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    totpEnable(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    totpDisable(req: FastifyRequest, reply: FastifyReply): Promise<never>;
};
//# sourceMappingURL=auth.controller.d.ts.map