import type { FastifyRequest, FastifyReply } from 'fastify';
import { SchemaValidator } from '../../core/validation/schema-validator';
import { companyStatusSchema, createCompanySchema, idParamsSchema, updateCompanySchema } from './superadmin.dto';
import type { SuperadminService } from './superadmin.service';

/** Adapta HTTP ⇄ SuperadminService. */
export class SuperadminController {
    constructor(private readonly service: SuperadminService) {}

    stats = async (_req: FastifyRequest, reply: FastifyReply) => reply.send(await this.service.stats());

    listCompanies = async (_req: FastifyRequest, reply: FastifyReply) => reply.send(await this.service.listCompanies());

    createCompany = async (req: FastifyRequest, reply: FastifyReply) => {
        const input = SchemaValidator.parse(createCompanySchema, req.body);
        return reply.status(201).send(await this.service.createCompany(input));
    };

    updateCompany = async (req: FastifyRequest, reply: FastifyReply) => {
        const { id } = SchemaValidator.parse(idParamsSchema, req.params);
        return reply.send(await this.service.updateCompany(id, SchemaValidator.parse(updateCompanySchema, req.body)));
    };

    setCompanyStatus = async (req: FastifyRequest, reply: FastifyReply) => {
        const { id } = SchemaValidator.parse(idParamsSchema, req.params);
        const { status } = SchemaValidator.parse(companyStatusSchema, req.body);
        return reply.send(await this.service.setCompanyStatus(id, status));
    };

    approveUser = async (req: FastifyRequest, reply: FastifyReply) => {
        const { id } = SchemaValidator.parse(idParamsSchema, req.params);
        return reply.send({ message: 'Usuário aprovado com sucesso', user: await this.service.approveUser(id) });
    };

    revokeUser = async (req: FastifyRequest, reply: FastifyReply) => {
        const { id } = SchemaValidator.parse(idParamsSchema, req.params);
        return reply.send({ message: 'Aprovação revogada', user: await this.service.revokeUser(req.user.id, id) });
    };
}
