/**
 * Erros de aplicação que já sabem seu status HTTP e o corpo da resposta.
 * O errorHandler só depende de AppError — novos tipos de erro entram como
 * subclasses, sem mexer no handler (OCP). Toda subclasse precisa ser
 * serializável pelo mesmo contrato (LSP).
 *
 * Corpo padrão `{ error, message }` com o mesmo texto: partes do front leem
 * `error`, outras (ex.: meu perfil) leem `message`.
 */
export abstract class AppError extends Error {
    abstract readonly statusCode: number;

    constructor(message: string) {
        super(message);
        this.name = new.target.name;
    }

    toResponse(): Record<string, unknown> {
        return { error: this.message, message: this.message };
    }
}

export class BadRequestError extends AppError {
    readonly statusCode = 400;
}

export class UnauthorizedError extends AppError {
    readonly statusCode = 401;
}

export class ForbiddenError extends AppError {
    readonly statusCode = 403;
}

export class NotFoundError extends AppError {
    readonly statusCode = 404;
}

export class ConflictError extends AppError {
    readonly statusCode = 409;
}

export class PayloadTooLargeError extends AppError {
    readonly statusCode = 413;
}

/** A entrada é válida, mas um serviço externo a recusou (ex.: a Meta recusou o template). */
export class UnprocessableEntityError extends AppError {
    readonly statusCode = 422;
}

/** Um serviço do qual a API depende falhou ou não respondeu. */
export class BadGatewayError extends AppError {
    readonly statusCode = 502;
}

/** Dependência temporariamente fora do ar (ex.: Redis para o 2FA). */
export class ServiceUnavailableError extends AppError {
    readonly statusCode = 503;
}
