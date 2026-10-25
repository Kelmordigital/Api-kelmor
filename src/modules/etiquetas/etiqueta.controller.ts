import type { FastifyRequest, FastifyReply } from 'fastify';
import { SchemaValidator } from '../../core/validation/schema-validator';
import { companyIdOf } from '../../core/http/http-router';
import {
    automaticTagRuleSchema, contactEtiquetaParamsSchema, contactParamsSchema, createEtiquetaSchema,
    etiquetaIdParamsSchema, ruleIdParamsSchema, updateEtiquetaSchema,
} from './etiqueta.dto';
import type { EtiquetaService } from './etiqueta.service';
import type { AutomaticTagRuleService } from './automatic-tag-rule.service';

/** Adapta HTTP ⇄ EtiquetaService. */
export class EtiquetaController {
    constructor(private readonly service: EtiquetaService) {}

    list = async (req: FastifyRequest, reply: FastifyReply) => reply.send(await this.service.list(companyIdOf(req)));

    stats = async (req: FastifyRequest, reply: FastifyReply) => reply.send(await this.service.getStats(companyIdOf(req)));

    create = async (req: FastifyRequest, reply: FastifyReply) => {
        const input = SchemaValidator.parse(createEtiquetaSchema, req.body);
        return reply.status(201).send(await this.service.create(companyIdOf(req), input));
    };

    update = async (req: FastifyRequest, reply: FastifyReply) => {
        const { id } = SchemaValidator.parse(etiquetaIdParamsSchema, req.params);
        const input = SchemaValidator.parse(updateEtiquetaSchema, req.body);
        return reply.send(await this.service.update(id, companyIdOf(req), input));
    };

    remove = async (req: FastifyRequest, reply: FastifyReply) => {
        const { id } = SchemaValidator.parse(etiquetaIdParamsSchema, req.params);
        await this.service.remove(id, companyIdOf(req));
        return reply.status(204).send();
    };

    listForContact = async (req: FastifyRequest, reply: FastifyReply) => {
        const { contactId } = SchemaValidator.parse(contactParamsSchema, req.params);
        return reply.send(await this.service.listForContact(companyIdOf(req), contactId));
    };

    applyToContact = async (req: FastifyRequest, reply: FastifyReply) => {
        const { contactId, etiquetaId } = SchemaValidator.parse(contactEtiquetaParamsSchema, req.params);
        await this.service.applyToContact(companyIdOf(req), contactId, etiquetaId);
        return reply.status(204).send();
    };

    removeFromContact = async (req: FastifyRequest, reply: FastifyReply) => {
        const { contactId, etiquetaId } = SchemaValidator.parse(contactEtiquetaParamsSchema, req.params);
        await this.service.removeFromContact(companyIdOf(req), contactId, etiquetaId);
        return reply.status(204).send();
    };
}

/** Adapta HTTP ⇄ AutomaticTagRuleService. */
export class AutomaticTagRuleController {
    constructor(private readonly service: AutomaticTagRuleService) {}

    list = async (req: FastifyRequest, reply: FastifyReply) => reply.send(await this.service.list(companyIdOf(req)));

    create = async (req: FastifyRequest, reply: FastifyReply) => {
        const { keywords, etiqueta_ids } = SchemaValidator.parse(automaticTagRuleSchema, req.body);
        return reply.status(201).send(await this.service.create(companyIdOf(req), keywords, etiqueta_ids ?? []));
    };

    update = async (req: FastifyRequest, reply: FastifyReply) => {
        const { id } = SchemaValidator.parse(ruleIdParamsSchema, req.params);
        const { keywords, etiqueta_ids } = SchemaValidator.parse(automaticTagRuleSchema, req.body);
        return reply.send(await this.service.update(id, companyIdOf(req), keywords, etiqueta_ids ?? []));
    };

    remove = async (req: FastifyRequest, reply: FastifyReply) => {
        const { id } = SchemaValidator.parse(ruleIdParamsSchema, req.params);
        await this.service.remove(id, companyIdOf(req));
        return reply.status(204).send();
    };
}
