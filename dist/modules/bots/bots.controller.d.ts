import { FastifyRequest, FastifyReply } from 'fastify';
export declare const botsController: {
    list(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    stats(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    create(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    update(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    remove(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    toggleActive(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    setDefault(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    getNodes(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    syncNodes(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    /** Upload de mídia dos nós (imagem/vídeo/áudio/figurinha/documento). */
    uploadMedia(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    /** Relatório do nó Rotacionar Contato: leads distribuídos por contato. */
    rotateReport(req: FastifyRequest, reply: FastifyReply): Promise<never>;
};
//# sourceMappingURL=bots.controller.d.ts.map