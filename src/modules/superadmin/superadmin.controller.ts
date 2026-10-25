import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { superadminService } from './superadmin.service';
import { accountApproval } from '../auth/auth.module';
import { NotFoundError } from '../../core/errors/http-errors';

const createCompanySchema = z.object({
    name: z.string().min(2),
    cnpj_cpf: z.string().max(20).nullable().optional(),
    admin: z.object({
        name: z.string().min(2),
        email: z.string().email(),
        password: z.string().min(8),
    }),
});

const updateCompanySchema = z.object({
    name: z.string().min(1).optional(),
    cnpj_cpf: z.string().max(20).nullable().optional(),
});

const statusSchema = z.object({ status: z.boolean() });

export const superadminController = {
    async stats(_req: FastifyRequest, reply: FastifyReply) {
        return reply.send(await superadminService.stats());
    },

    async listCompanies(_req: FastifyRequest, reply: FastifyReply) {
        return reply.send(await superadminService.listCompanies());
    },

    async createCompany(req: FastifyRequest, reply: FastifyReply) {
        const data = createCompanySchema.parse(req.body);
        const result = await superadminService.createCompany(data);
        if (result === 'email_conflict') {
            return reply.status(409).send({ statusCode: 409, error: 'Conflict', message: 'Email já cadastrado' });
        }
        const { password_hash: _ph, ...adminSafe } = result.admin;
        return reply.status(201).send({ company: result.company, admin: adminSafe });
    },

    async updateCompany(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const data = updateCompanySchema.parse(req.body);
        const company = await superadminService.updateCompany(id, data);
        if (!company) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Empresa não encontrada' });
        return reply.send(company);
    },

    async setCompanyStatus(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const { status } = statusSchema.parse(req.body);
        const company = await superadminService.setCompanyStatus(id, status);
        if (!company) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Empresa não encontrada' });
        return reply.send(company);
    },

    async approveUser(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        try {
            const user = await accountApproval.approve(id);
            return reply.send({ message: 'Usuário aprovado com sucesso', user });
        } catch (err) {
            if (err instanceof NotFoundError) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Usuário não encontrado' });
            throw err;
        }
    },

    async revokeUser(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        if (id === req.user.id) {
            return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'O superAdmin não pode revogar a própria aprovação.' });
        }
        const user = await superadminService.revokeUser(id);
        if (!user) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Usuário não encontrado' });
        return reply.send({ message: 'Aprovação revogada', user });
    },
};
