import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../core/errors/http-errors';

export function errorHandler(
    error: FastifyError | Error,
    request: FastifyRequest,
    reply: FastifyReply
) {
    request.log.error(error);

    // Erros de aplicação (src/core/errors) — cada um define status e corpo
    if (error instanceof AppError) {
        return reply.status(error.statusCode).send(error.toResponse());
    }

    // Erros de validação do Zod
    if (error instanceof ZodError) {
        return reply.status(400).send({
            statusCode: 400,
            error: 'Validation Error',
            issues: error.flatten().fieldErrors,
        });
    }

    // Erros do Fastify (ex: schema validation)
    if ('statusCode' in error && error.statusCode) {
        return reply.status(error.statusCode).send({
            statusCode: error.statusCode,
            error: error.name,
            message: error.message,
        });
    }

    // Erro genérico (nunca expõe detalhes em produção)
    return reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message:
            process.env.NODE_ENV === 'production'
                ? 'Algo deu errado.'
                : error.message,
    });
}