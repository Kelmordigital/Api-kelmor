import type { FastifyRequest, FastifyReply } from 'fastify';
import { SchemaValidator } from '../../core/validation/schema-validator';
import { companyIdOf } from '../../core/http/http-router';
import {
    campaignIdParamsSchema, createCampaignSchema, textIdParamsSchema, textSchema, updateCampaignSchema,
} from './campanha.dto';
import type { CampaignService, ScheduledTextService } from './campanha.service';

/** Adapta HTTP ⇄ campanhas e textos de agendamento. */
export class CampanhaController {
    constructor(
        private readonly campaigns: CampaignService,
        private readonly texts: ScheduledTextService,
    ) {}

    list = async (req: FastifyRequest, reply: FastifyReply) => reply.send(await this.campaigns.list(companyIdOf(req)));

    getSelects = async (req: FastifyRequest, reply: FastifyReply) => reply.send(await this.campaigns.options(companyIdOf(req)));

    create = async (req: FastifyRequest, reply: FastifyReply) => {
        const input = SchemaValidator.parse(createCampaignSchema, req.body);
        return reply.status(201).send(await this.campaigns.create(companyIdOf(req), input));
    };

    update = async (req: FastifyRequest, reply: FastifyReply) => {
        const { id } = SchemaValidator.parse(campaignIdParamsSchema, req.params);
        await this.campaigns.update(id, companyIdOf(req), SchemaValidator.parse(updateCampaignSchema, req.body));
        return reply.send({ ok: true });
    };

    remove = async (req: FastifyRequest, reply: FastifyReply) => {
        const { id } = SchemaValidator.parse(campaignIdParamsSchema, req.params);
        await this.campaigns.delete(id, companyIdOf(req));
        return reply.send({ ok: true });
    };

    play = async (req: FastifyRequest, reply: FastifyReply) => {
        const { id } = SchemaValidator.parse(campaignIdParamsSchema, req.params);
        await this.campaigns.play(id, companyIdOf(req));
        return reply.send({ ok: true });
    };

    pause = async (req: FastifyRequest, reply: FastifyReply) => {
        const { id } = SchemaValidator.parse(campaignIdParamsSchema, req.params);
        await this.campaigns.pause(id, companyIdOf(req));
        return reply.send({ ok: true });
    };

    listTexts = async (req: FastifyRequest, reply: FastifyReply) => reply.send(await this.texts.list(companyIdOf(req)));

    createText = async (req: FastifyRequest, reply: FastifyReply) => {
        const input = SchemaValidator.parse(textSchema, req.body);
        return reply.status(201).send(await this.texts.create(companyIdOf(req), input));
    };

    updateText = async (req: FastifyRequest, reply: FastifyReply) => {
        const { id } = SchemaValidator.parse(textIdParamsSchema, req.params);
        return reply.send(await this.texts.update(id, companyIdOf(req), SchemaValidator.parse(textSchema, req.body)));
    };

    removeText = async (req: FastifyRequest, reply: FastifyReply) => {
        const { id } = SchemaValidator.parse(textIdParamsSchema, req.params);
        await this.texts.remove(id, companyIdOf(req));
        return reply.send({ ok: true });
    };
}
