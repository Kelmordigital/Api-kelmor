"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.companyIdOf = companyIdOf;
exports.requireCompanyId = requireCompanyId;
const http_errors_1 = require("../errors/http-errors");
/** Empresa do usuário autenticado (rotas de empresa exigem company_id). */
function companyIdOf(req) {
    return req.user.company_id;
}
/**
 * Empresa do usuário, recusando quem não tem (superAdmin). Para recursos que
 * só existem dentro de uma empresa e ficam abertos ao superAdmin pelo perfil.
 */
function requireCompanyId(req) {
    if (!req.user.company_id)
        throw new http_errors_1.ForbiddenError('Empresa não encontrada');
    return req.user.company_id;
}
//# sourceMappingURL=http-router.js.map