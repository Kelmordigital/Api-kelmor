"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CampanhaController = void 0;
const schema_validator_1 = require("../../core/validation/schema-validator");
const http_router_1 = require("../../core/http/http-router");
const campanha_dto_1 = require("./campanha.dto");
/** Adapta HTTP ⇄ campanhas e textos de agendamento. */
class CampanhaController {
    campaigns;
    texts;
    constructor(campaigns, texts) {
        this.campaigns = campaigns;
        this.texts = texts;
    }
    list = async (req, reply) => reply.send(await this.campaigns.list((0, http_router_1.companyIdOf)(req)));
    getSelects = async (req, reply) => reply.send(await this.campaigns.options((0, http_router_1.companyIdOf)(req)));
    create = async (req, reply) => {
        const input = schema_validator_1.SchemaValidator.parse(campanha_dto_1.createCampaignSchema, req.body);
        return reply.status(201).send(await this.campaigns.create((0, http_router_1.companyIdOf)(req), input));
    };
    update = async (req, reply) => {
        const { id } = schema_validator_1.SchemaValidator.parse(campanha_dto_1.campaignIdParamsSchema, req.params);
        await this.campaigns.update(id, (0, http_router_1.companyIdOf)(req), schema_validator_1.SchemaValidator.parse(campanha_dto_1.updateCampaignSchema, req.body));
        return reply.send({ ok: true });
    };
    remove = async (req, reply) => {
        const { id } = schema_validator_1.SchemaValidator.parse(campanha_dto_1.campaignIdParamsSchema, req.params);
        await this.campaigns.delete(id, (0, http_router_1.companyIdOf)(req));
        return reply.send({ ok: true });
    };
    play = async (req, reply) => {
        const { id } = schema_validator_1.SchemaValidator.parse(campanha_dto_1.campaignIdParamsSchema, req.params);
        await this.campaigns.play(id, (0, http_router_1.companyIdOf)(req));
        return reply.send({ ok: true });
    };
    pause = async (req, reply) => {
        const { id } = schema_validator_1.SchemaValidator.parse(campanha_dto_1.campaignIdParamsSchema, req.params);
        await this.campaigns.pause(id, (0, http_router_1.companyIdOf)(req));
        return reply.send({ ok: true });
    };
    listTexts = async (req, reply) => reply.send(await this.texts.list((0, http_router_1.companyIdOf)(req)));
    createText = async (req, reply) => {
        const input = schema_validator_1.SchemaValidator.parse(campanha_dto_1.textSchema, req.body);
        return reply.status(201).send(await this.texts.create((0, http_router_1.companyIdOf)(req), input));
    };
    updateText = async (req, reply) => {
        const { id } = schema_validator_1.SchemaValidator.parse(campanha_dto_1.textIdParamsSchema, req.params);
        return reply.send(await this.texts.update(id, (0, http_router_1.companyIdOf)(req), schema_validator_1.SchemaValidator.parse(campanha_dto_1.textSchema, req.body)));
    };
    removeText = async (req, reply) => {
        const { id } = schema_validator_1.SchemaValidator.parse(campanha_dto_1.textIdParamsSchema, req.params);
        await this.texts.remove(id, (0, http_router_1.companyIdOf)(req));
        return reply.send({ ok: true });
    };
}
exports.CampanhaController = CampanhaController;
//# sourceMappingURL=campanha.controller.js.map