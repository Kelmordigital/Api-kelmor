"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScheduledTextService = exports.CampaignService = void 0;
const http_errors_1 = require("../../core/errors/http-errors");
/**
 * Campanhas de disparo: validadas e escopadas pela empresa aqui, executadas
 * pelo microsserviço `campaigns`. Conexões e contatos de outra empresa nunca
 * são repassados (defesa em profundidade: o microsserviço também confere).
 */
class CampaignService {
    gateway;
    resources;
    repository;
    constructor(gateway, resources, repository) {
        this.gateway = gateway;
        this.resources = resources;
        this.repository = repository;
    }
    list(companyId) {
        return this.gateway.list(companyId);
    }
    options(companyId) {
        return this.repository.options(companyId);
    }
    async create(companyId, input) {
        const payload = await this.scoped(companyId, input);
        if (!payload.connection_ids?.length)
            throw new http_errors_1.BadRequestError('Selecione ao menos uma conexão');
        return this.gateway.create(companyId, payload);
    }
    async update(id, companyId, input) {
        await this.gateway.update(id, companyId, await this.scoped(companyId, input));
    }
    delete(id, companyId) {
        return this.gateway.delete(id, companyId);
    }
    play(id, companyId) {
        return this.gateway.play(id, companyId);
    }
    pause(id, companyId) {
        return this.gateway.pause(id, companyId);
    }
    /** Só campos conhecidos, com conexões/contatos filtrados para os da empresa. */
    async scoped(companyId, input) {
        const { connection_ids, contact_ids, ...fields } = input;
        const payload = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
        if (connection_ids !== undefined)
            payload.connection_ids = await this.resources.ownedConnectionIds(companyId, connection_ids);
        if (contact_ids !== undefined)
            payload.contact_ids = await this.resources.ownedContactIds(companyId, contact_ids);
        return payload;
    }
}
exports.CampaignService = CampaignService;
/**
 * Textos prontos de agendamento da empresa, oferecidos ao atendente no modal
 * "Agendar mensagem" do atendimento. Cada empresa cadastra os seus; a ordem
 * de exibição é a de criação.
 */
class ScheduledTextService {
    repository;
    constructor(repository) {
        this.repository = repository;
    }
    list(companyId) {
        return this.repository.listTexts(companyId);
    }
    async create(companyId, input) {
        const position = (await this.repository.lastTextPosition(companyId)) + 1;
        const [created] = await this.repository.insertTexts(companyId, [{ label: input.label, text: input.text ?? null, type: position }]);
        return created;
    }
    async update(id, companyId, input) {
        const row = await this.repository.updateText(id, companyId, { label: input.label, text: input.text ?? null });
        if (!row)
            throw ScheduledTextService.notFound();
        return row;
    }
    async remove(id, companyId) {
        if (!(await this.repository.deleteText(id, companyId)))
            throw ScheduledTextService.notFound();
    }
    static notFound() {
        return new http_errors_1.NotFoundError('Texto não encontrado');
    }
}
exports.ScheduledTextService = ScheduledTextService;
//# sourceMappingURL=campanha.service.js.map