"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.superadminController = void 0;
const zod_1 = require("zod");
const superadmin_service_1 = require("./superadmin.service");
const auth_module_1 = require("../auth/auth.module");
const http_errors_1 = require("../../core/errors/http-errors");
const createCompanySchema = zod_1.z.object({
    name: zod_1.z.string().min(2),
    cnpj_cpf: zod_1.z.string().max(20).nullable().optional(),
    admin: zod_1.z.object({
        name: zod_1.z.string().min(2),
        email: zod_1.z.string().email(),
        password: zod_1.z.string().min(8),
    }),
});
const updateCompanySchema = zod_1.z.object({
    name: zod_1.z.string().min(1).optional(),
    cnpj_cpf: zod_1.z.string().max(20).nullable().optional(),
});
const statusSchema = zod_1.z.object({ status: zod_1.z.boolean() });
exports.superadminController = {
    async stats(_req, reply) {
        return reply.send(await superadmin_service_1.superadminService.stats());
    },
    async listCompanies(_req, reply) {
        return reply.send(await superadmin_service_1.superadminService.listCompanies());
    },
    async createCompany(req, reply) {
        const data = createCompanySchema.parse(req.body);
        const result = await superadmin_service_1.superadminService.createCompany(data);
        if (result === 'email_conflict') {
            return reply.status(409).send({ statusCode: 409, error: 'Conflict', message: 'Email já cadastrado' });
        }
        const { password_hash: _ph, ...adminSafe } = result.admin;
        return reply.status(201).send({ company: result.company, admin: adminSafe });
    },
    async updateCompany(req, reply) {
        const { id } = req.params;
        const data = updateCompanySchema.parse(req.body);
        const company = await superadmin_service_1.superadminService.updateCompany(id, data);
        if (!company)
            return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Empresa não encontrada' });
        return reply.send(company);
    },
    async setCompanyStatus(req, reply) {
        const { id } = req.params;
        const { status } = statusSchema.parse(req.body);
        const company = await superadmin_service_1.superadminService.setCompanyStatus(id, status);
        if (!company)
            return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Empresa não encontrada' });
        return reply.send(company);
    },
    async approveUser(req, reply) {
        const { id } = req.params;
        try {
            const user = await auth_module_1.accountApproval.approve(id);
            return reply.send({ message: 'Usuário aprovado com sucesso', user });
        }
        catch (err) {
            if (err instanceof http_errors_1.NotFoundError)
                return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Usuário não encontrado' });
            throw err;
        }
    },
    async revokeUser(req, reply) {
        const { id } = req.params;
        if (id === req.user.id) {
            return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'O superAdmin não pode revogar a própria aprovação.' });
        }
        const user = await superadmin_service_1.superadminService.revokeUser(id);
        if (!user)
            return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Usuário não encontrado' });
        return reply.send({ message: 'Aprovação revogada', user });
    },
};
//# sourceMappingURL=superadmin.controller.js.map