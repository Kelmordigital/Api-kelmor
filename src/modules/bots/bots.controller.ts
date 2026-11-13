import type { FastifyRequest, FastifyReply } from 'fastify';
import { SchemaValidator } from '../../core/validation/schema-validator';
import { requireCompanyId } from '../../core/http/http-router';
import { BadRequestError } from '../../core/errors/http-errors';
import type { MultipartFormReader } from '../../core/http/multipart-form-reader';
import { botIdParamsSchema, createBotSchema, rotateReportParamsSchema, syncNodesSchema, updateBotSchema } from './bots.dto';
import type { BotService } from './bots.service';

/** Adapta HTTP ⇄ BotService. */
export class BotController {
    constructor(
        private readonly service: BotService,
        private readonly mediaReader: MultipartFormReader,
    ) {}

    list = async (req: FastifyRequest, reply: FastifyReply) => reply.send(await this.service.list(requireCompanyId(req)));

    stats = async (req: FastifyRequest, reply: FastifyReply) => reply.send(await this.service.stats(requireCompanyId(req)));

    create = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = requireCompanyId(req);
        return reply.status(201).send(await this.service.create(companyId, SchemaValidator.parse(createBotSchema, req.body)));
    };

    update = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = requireCompanyId(req);
        const { id } = SchemaValidator.parse(botIdParamsSchema, req.params);
        return reply.send(await this.service.update(id, companyId, SchemaValidator.parse(updateBotSchema, req.body)));
    };

    remove = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = requireCompanyId(req);
        const { id } = SchemaValidator.parse(botIdParamsSchema, req.params);
        await this.service.remove(id, companyId);
        return reply.send({ ok: true });
    };

    toggleActive = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = requireCompanyId(req);
        const { id } = SchemaValidator.parse(botIdParamsSchema, req.params);
        return reply.send(await this.service.toggleActive(id, companyId));
    };

    setDefault = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = requireCompanyId(req);
        const { id } = SchemaValidator.parse(botIdParamsSchema, req.params);
        return reply.send(await this.service.setDefault(id, companyId));
    };

    getNodes = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = requireCompanyId(req);
        const { id } = SchemaValidator.parse(botIdParamsSchema, req.params);
        return reply.send(await this.service.getNodes(id, companyId));
    };

    syncNodes = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = requireCompanyId(req);
        const { id } = SchemaValidator.parse(botIdParamsSchema, req.params);
        const { nodes } = SchemaValidator.parse(syncNodesSchema, req.body);
        await this.service.syncNodes(id, companyId, nodes);
        return reply.send({ ok: true });
    };

    /** Upload de mídia dos nós (imagem/vídeo/áudio/figurinha/documento). */
    uploadMedia = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = requireCompanyId(req);
        const { file } = await this.mediaReader.read(req, `bots/${companyId}`);
        if (!file) throw new BadRequestError('Arquivo não enviado');
        return reply.status(201).send({ url: file.url, mimetype: file.mimeType, originalname: file.originalName });
    };

    /** Relatório do nó Rotacionar Contato: leads distribuídos por contato. */
    rotateReport = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = requireCompanyId(req);
        const { id, nodeId } = SchemaValidator.parse(rotateReportParamsSchema, req.params);
        return reply.send(await this.service.rotateReport(id, companyId, nodeId));
    };
}
