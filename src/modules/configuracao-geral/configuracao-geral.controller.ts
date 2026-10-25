import type { FastifyRequest, FastifyReply } from 'fastify';
import { SchemaValidator } from '../../core/validation/schema-validator';
import { requireCompanyId } from '../../core/http/http-router';
import { updateConfiguracaoGeralSchema, updateInputFrom } from './configuracao-geral.dto';
import type { ConfiguracaoGeralService } from './configuracao-geral.service';

/** Adapta HTTP ⇄ ConfiguracaoGeralService. */
export class ConfiguracaoGeralController {
    constructor(private readonly service: ConfiguracaoGeralService) {}

    get = async (req: FastifyRequest, reply: FastifyReply) => {
        return reply.send(await this.service.view(requireCompanyId(req)));
    };

    update = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = requireCompanyId(req);
        const body = SchemaValidator.parse(updateConfiguracaoGeralSchema, req.body);
        return reply.send(await this.service.update(companyId, updateInputFrom(body)));
    };
}
