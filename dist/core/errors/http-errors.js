"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServiceUnavailableError = exports.BadGatewayError = exports.PayloadTooLargeError = exports.ConflictError = exports.NotFoundError = exports.ForbiddenError = exports.UnauthorizedError = exports.BadRequestError = exports.AppError = void 0;
/**
 * Erros de aplicação que já sabem seu status HTTP e o corpo da resposta.
 * O errorHandler só depende de AppError — novos tipos de erro entram como
 * subclasses, sem mexer no handler (OCP). Toda subclasse precisa ser
 * serializável pelo mesmo contrato (LSP).
 *
 * Corpo padrão `{ error, message }` com o mesmo texto: partes do front leem
 * `error`, outras (ex.: meu perfil) leem `message`.
 */
class AppError extends Error {
    constructor(message) {
        super(message);
        this.name = new.target.name;
    }
    toResponse() {
        return { error: this.message, message: this.message };
    }
}
exports.AppError = AppError;
class BadRequestError extends AppError {
    statusCode = 400;
}
exports.BadRequestError = BadRequestError;
class UnauthorizedError extends AppError {
    statusCode = 401;
}
exports.UnauthorizedError = UnauthorizedError;
class ForbiddenError extends AppError {
    statusCode = 403;
}
exports.ForbiddenError = ForbiddenError;
class NotFoundError extends AppError {
    statusCode = 404;
}
exports.NotFoundError = NotFoundError;
class ConflictError extends AppError {
    statusCode = 409;
}
exports.ConflictError = ConflictError;
class PayloadTooLargeError extends AppError {
    statusCode = 413;
}
exports.PayloadTooLargeError = PayloadTooLargeError;
/** Um serviço do qual a API depende falhou ou não respondeu. */
class BadGatewayError extends AppError {
    statusCode = 502;
}
exports.BadGatewayError = BadGatewayError;
/** Dependência temporariamente fora do ar (ex.: Redis para o 2FA). */
class ServiceUnavailableError extends AppError {
    statusCode = 503;
}
exports.ServiceUnavailableError = ServiceUnavailableError;
//# sourceMappingURL=http-errors.js.map