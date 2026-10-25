"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publicApiErrorBody = publicApiErrorBody;
const STATUS_TEXT = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    413: 'Payload Too Large',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
};
/**
 * Corpo de erro das APIs públicas (chamadas por sistemas de clientes):
 * `{ statusCode, error: "<nome do status>", message }`. É um contrato com
 * terceiros — diferente do corpo interno `{ error, message }` usado pelo front.
 */
function publicApiErrorBody(err) {
    return { statusCode: err.statusCode, error: STATUS_TEXT[err.statusCode] ?? 'Error', message: err.message };
}
//# sourceMappingURL=public-api-error.js.map