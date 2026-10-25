"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EtiquetaService = void 0;
const http_errors_1 = require("../../core/errors/http-errors");
const DEFAULT_COLOR = '#6366f1';
const DEFAULT_ICON = 'tag';
const STATS_DAYS = 7;
class EtiquetaService {
    repository;
    directory;
    now;
    constructor(repository, directory, now = () => new Date()) {
        this.repository = repository;
        this.directory = directory;
        this.now = now;
    }
    list(companyId) {
        return this.repository.listByCompany(companyId);
    }
    create(companyId, input) {
        return this.repository.create(companyId, {
            name: input.name,
            color: input.color ?? DEFAULT_COLOR,
            icon: input.icon ?? DEFAULT_ICON,
        });
    }
    async update(id, companyId, input) {
        const patch = {};
        if (input.name !== undefined)
            patch.name = input.name;
        if (input.color !== undefined)
            patch.color = input.color;
        if (input.icon !== undefined)
            patch.icon = input.icon;
        const row = await this.repository.update(id, companyId, patch);
        if (!row)
            throw EtiquetaService.tagNotFound();
        return row;
    }
    async remove(id, companyId) {
        if (!(await this.repository.delete(id, companyId)))
            throw EtiquetaService.tagNotFound();
    }
    /** Etiqueta e contato precisam ser da empresa. Aplicar de novo não duplica. */
    async applyToContact(companyId, contactId, etiquetaId) {
        if (!(await this.repository.findById(etiquetaId, companyId)))
            throw EtiquetaService.tagNotFound();
        if (!(await this.directory.hasContact(companyId, contactId)))
            throw new http_errors_1.NotFoundError('Contato não encontrado');
        await this.repository.linkToContact(contactId, etiquetaId);
    }
    /** Sem efeito (e sem erro) se a etiqueta ou o contato não forem da empresa. */
    async removeFromContact(companyId, contactId, etiquetaId) {
        const [ownsContact, tag] = await Promise.all([
            this.directory.hasContact(companyId, contactId),
            this.repository.findById(etiquetaId, companyId),
        ]);
        if (ownsContact && tag)
            await this.repository.unlinkFromContact(contactId, etiquetaId);
    }
    /** Contato de outra empresa responde lista vazia (não revela que existe). */
    async listForContact(companyId, contactId) {
        if (!(await this.directory.hasContact(companyId, contactId)))
            return [];
        return this.repository.listForContact(contactId, companyId);
    }
    /** Total de contatos por etiqueta e aplicações por dia nos últimos 7 dias (hoje incluso, UTC). */
    async getStats(companyId) {
        const tags = await this.repository.listByCompany(companyId);
        const days = this.lastDays();
        const usage = await this.repository.usage(tags.map((t) => t.id), new Date(`${days[0]}T00:00:00.000Z`));
        return tags.map((tag) => ({
            etiqueta_id: tag.id,
            name: tag.name,
            color: tag.color,
            total_leads: usage.totals.get(tag.id) ?? 0,
            series: days.map((date) => ({ date, count: usage.daily.get(tag.id)?.get(date) ?? 0 })),
        }));
    }
    lastDays() {
        const today = this.now();
        return Array.from({ length: STATS_DAYS }, (_, i) => {
            const d = new Date(today);
            d.setUTCDate(d.getUTCDate() - (STATS_DAYS - 1 - i));
            return d.toISOString().slice(0, 10);
        });
    }
    static tagNotFound() {
        return new http_errors_1.NotFoundError('Etiqueta não encontrada');
    }
}
exports.EtiquetaService = EtiquetaService;
//# sourceMappingURL=etiqueta.service.js.map