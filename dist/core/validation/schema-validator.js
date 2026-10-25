"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchemaValidator = void 0;
const http_errors_1 = require("../errors/http-errors");
/**
 * Valida a entrada de uma requisição contra um schema zod.
 * Campos fora do schema são descartados (zod faz strip por padrão), o que
 * impede mass-assignment de colunas como id/company_id.
 * Falha com BadRequestError carregando a mensagem da primeira violação.
 */
class SchemaValidator {
    static parse(schema, input) {
        const result = schema.safeParse(input);
        if (!result.success) {
            throw new http_errors_1.BadRequestError(result.error.issues[0]?.message ?? 'Requisição inválida');
        }
        return result.data;
    }
}
exports.SchemaValidator = SchemaValidator;
//# sourceMappingURL=schema-validator.js.map