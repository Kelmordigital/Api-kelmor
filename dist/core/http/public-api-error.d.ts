import type { AppError } from '../errors/http-errors';
/**
 * Corpo de erro das APIs públicas (chamadas por sistemas de clientes):
 * `{ statusCode, error: "<nome do status>", message }`. É um contrato com
 * terceiros — diferente do corpo interno `{ error, message }` usado pelo front.
 */
export declare function publicApiErrorBody(err: AppError): {
    statusCode: number;
    error: string;
    message: string;
};
//# sourceMappingURL=public-api-error.d.ts.map