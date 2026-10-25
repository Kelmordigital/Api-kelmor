"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CupomService = void 0;
const http_errors_1 = require("../../core/errors/http-errors");
const cupom_repository_1 = require("./cupom.repository");
const cupom_definition_1 = require("./cupom.definition");
class CupomService {
    repository;
    policies;
    constructor(repository, policies) {
        this.repository = repository;
        this.policies = policies;
    }
    list(companyId) {
        return this.repository.listByCompany(companyId);
    }
    async create(companyId, input) {
        const cupom = cupom_definition_1.CupomDefinition.create(input, this.policies);
        await this.ensureCodeAvailable(companyId, cupom.code);
        return this.repository.create(companyId, cupom.toPersistence());
    }
    async update(id, companyId, patch) {
        const existing = this.orNotFound(await this.repository.findById(id, companyId));
        const cupom = cupom_definition_1.CupomDefinition.revise(existing, patch, this.policies);
        await this.ensureCodeAvailable(companyId, cupom.code, id);
        return this.orNotFound(await this.repository.update(id, companyId, cupom.toPersistence()));
    }
    async remove(id, companyId) {
        if (!(await this.repository.delete(id, companyId)))
            throw CupomService.notFound();
    }
    async ensureCodeAvailable(companyId, code, excludeId) {
        if (await this.repository.isCodeTaken(companyId, code, excludeId)) {
            throw new http_errors_1.ConflictError(cupom_repository_1.DUPLICATE_CODE_MESSAGE);
        }
    }
    orNotFound(row) {
        if (!row)
            throw CupomService.notFound();
        return row;
    }
    static notFound() {
        return new http_errors_1.NotFoundError('Cupom não encontrado');
    }
}
exports.CupomService = CupomService;
//# sourceMappingURL=cupom.service.js.map