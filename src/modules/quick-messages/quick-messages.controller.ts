import type { FastifyRequest, FastifyReply } from 'fastify';
import { SchemaValidator } from '../../core/validation/schema-validator';
import { companyIdOf } from '../../core/http/http-router';
import { Pagination } from '../../core/http/pagination';
import type { MultipartFormReader } from '../../core/http/multipart-form-reader';
import {
    QUICK_MESSAGE_PAGINATION, quickMessageIdParamsSchema, quickMessageListQuerySchema, quickMessageInputFrom,
} from './quick-messages.dto';
import type { QuickMessageService } from './quick-messages.service';

/** Adapta HTTP ⇄ QuickMessageService: lê query/multipart e escolhe o status. */
export class QuickMessageController {
    constructor(
        private readonly service: QuickMessageService,
        private readonly formReader: MultipartFormReader,
    ) {}

    list = async (req: FastifyRequest, reply: FastifyReply) => {
        const query = SchemaValidator.parse(quickMessageListQuerySchema, req.query);
        const pagination = Pagination.fromQuery(query, QUICK_MESSAGE_PAGINATION);
        return reply.send(await this.service.list(companyIdOf(req), pagination, query.search));
    };

    create = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = companyIdOf(req);
        const form = await this.formReader.read(req, this.folderFor(companyId));
        return reply.status(201).send(await this.service.create(companyId, quickMessageInputFrom(form), form.file));
    };

    update = async (req: FastifyRequest, reply: FastifyReply) => {
        const { id } = SchemaValidator.parse(quickMessageIdParamsSchema, req.params);
        const companyId = companyIdOf(req);
        const form = await this.formReader.read(req, this.folderFor(companyId));
        return reply.send(await this.service.update(id, companyId, quickMessageInputFrom(form), form.file));
    };

    remove = async (req: FastifyRequest, reply: FastifyReply) => {
        const { id } = SchemaValidator.parse(quickMessageIdParamsSchema, req.params);
        await this.service.remove(id, companyIdOf(req));
        return reply.status(204).send();
    };

    private folderFor(companyId: string): string {
        return `quick-messages/${companyId}`;
    }
}
