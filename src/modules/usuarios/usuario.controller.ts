import { FastifyRequest, FastifyReply } from 'fastify';
import { usuarioService } from './usuario.service';

export const usuarioController = {

    async listSelects(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const [queues, connections] = await Promise.all([
            usuarioService.listQueues(companyId),
            usuarioService.listConnections(companyId),
        ]);
        return reply.send({ queues, connections });
    },

    async list(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const data = await usuarioService.list(companyId);
        return reply.send(data);
    },

    async create(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const body = req.body as {
            name?: string;
            email?: string;
            password?: string;
            profile_id?: number;
            queue_ids?: number[];
            connection_ids?: number[];
        };

        if (!body.name?.trim() || !body.email?.trim() || !body.password?.trim()) {
            return reply.status(400).send({ message: 'Nome, e-mail e senha são obrigatórios' });
        }
        if (body.profile_id === 3) {
            return reply.status(403).send({ message: 'Não é permitido criar superAdmin' });
        }

        try {
            const user = await usuarioService.create(companyId, {
                name: body.name.trim(),
                email: body.email.trim(),
                password: body.password.trim(),
                profile_id: body.profile_id ?? 1,
                queue_ids: body.queue_ids ?? [],
                connection_ids: body.connection_ids ?? [],
            });
            return reply.status(201).send(user);
        } catch (err: any) {
            if (err.message === 'EMAIL_TAKEN') {
                return reply.status(409).send({ message: 'E-mail já cadastrado' });
            }
            throw err;
        }
    },

    async update(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const companyId = req.user.company_id!;
        const body = req.body as {
            name?: string;
            email?: string;
            password?: string;
            profile_id?: number;
            queue_ids?: number[];
            connection_ids?: number[];
        };

        if (body.profile_id === 3) {
            return reply.status(403).send({ message: 'Não é permitido definir superAdmin' });
        }

        await usuarioService.update(id, companyId, body);
        return reply.send({ ok: true });
    },

    async remove(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const companyId = req.user.company_id!;

        if (id === req.user.id) {
            return reply.status(400).send({ message: 'Você não pode excluir seu próprio usuário' });
        }

        const removed = await usuarioService.remove(id, companyId);
        if (!removed) {
            return reply.status(404).send({ message: 'Usuário não encontrado' });
        }
        return reply.send({ ok: true });
    },
};
