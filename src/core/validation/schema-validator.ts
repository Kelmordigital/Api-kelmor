import type { ZodType } from 'zod';
import { BadRequestError } from '../errors/http-errors';

/**
 * Valida a entrada de uma requisição contra um schema zod.
 * Campos fora do schema são descartados (zod faz strip por padrão), o que
 * impede mass-assignment de colunas como id/company_id.
 * Falha com BadRequestError carregando a mensagem da primeira violação.
 */
export class SchemaValidator {
    static parse<T>(schema: ZodType<T>, input: unknown): T {
        const result = schema.safeParse(input);
        if (!result.success) {
            throw new BadRequestError(result.error.issues[0]?.message ?? 'Requisição inválida');
        }
        return result.data;
    }
}
