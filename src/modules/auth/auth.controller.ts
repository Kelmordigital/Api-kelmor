import { FastifyRequest, FastifyReply } from 'fastify';

export const authController = {
    async register(_req: FastifyRequest, reply: FastifyReply) {
        return reply.status(501).send({ message: 'Not implemented — Sub-projeto 2' });
    },
    async login(_req: FastifyRequest, reply: FastifyReply) {
        return reply.status(501).send({ message: 'Not implemented — Sub-projeto 2' });
    },
    async refresh(_req: FastifyRequest, reply: FastifyReply) {
        return reply.status(501).send({ message: 'Not implemented — Sub-projeto 2' });
    },
    async logout(_req: FastifyRequest, reply: FastifyReply) {
        return reply.status(501).send({ message: 'Not implemented — Sub-projeto 2' });
    },
    async me(_req: FastifyRequest, reply: FastifyReply) {
        return reply.status(501).send({ message: 'Not implemented — Sub-projeto 2' });
    },
};
