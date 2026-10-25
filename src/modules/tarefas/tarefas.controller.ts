import type { FastifyRequest, FastifyReply } from 'fastify';
import { SchemaValidator } from '../../core/validation/schema-validator';
import { requireCompanyId } from '../../core/http/http-router';
import {
    columnSchema, contactParamsSchema, createTaskSchema, idParamsSchema, moveTaskSchema,
    ownerQuerySchema, setArchivedSchema, setDoneSchema, updateTaskSchema,
} from './tarefas.dto';
import type { TarefasService, Viewer } from './tarefas.service';

/** Adapta HTTP ⇄ TarefasService. */
export class TarefasController {
    constructor(private readonly service: TarefasService) {}

    board = async (req: FastifyRequest, reply: FastifyReply) => {
        const { owner_id } = SchemaValidator.parse(ownerQuerySchema, req.query);
        return reply.send(await this.service.getBoard(this.viewer(req), owner_id));
    };

    archived = async (req: FastifyRequest, reply: FastifyReply) => {
        const { owner_id } = SchemaValidator.parse(ownerQuerySchema, req.query);
        return reply.send(await this.service.getArchived(this.viewer(req), owner_id));
    };

    byContact = async (req: FastifyRequest, reply: FastifyReply) => {
        const viewer = this.viewer(req);
        const { contactId } = SchemaValidator.parse(contactParamsSchema, req.params);
        return reply.send(await this.service.listByContact(viewer, contactId));
    };

    create = async (req: FastifyRequest, reply: FastifyReply) => {
        const viewer = this.viewer(req);
        const input = SchemaValidator.parse(createTaskSchema, req.body);
        return reply.status(201).send(await this.service.create(viewer, input));
    };

    update = async (req: FastifyRequest, reply: FastifyReply) => {
        const viewer = this.viewer(req);
        const { id } = SchemaValidator.parse(idParamsSchema, req.params);
        return reply.send(await this.service.update(viewer, id, SchemaValidator.parse(updateTaskSchema, req.body)));
    };

    move = async (req: FastifyRequest, reply: FastifyReply) => {
        const viewer = this.viewer(req);
        const { id } = SchemaValidator.parse(idParamsSchema, req.params);
        const { column_id, index } = SchemaValidator.parse(moveTaskSchema, req.body);
        return reply.send(await this.service.move(viewer, id, column_id, index ?? 0));
    };

    setDone = async (req: FastifyRequest, reply: FastifyReply) => {
        const viewer = this.viewer(req);
        const { id } = SchemaValidator.parse(idParamsSchema, req.params);
        const body = SchemaValidator.parse(setDoneSchema, req.body);
        return reply.send(await this.service.setDone(viewer, id, body?.done ?? true));
    };

    setArchived = async (req: FastifyRequest, reply: FastifyReply) => {
        const viewer = this.viewer(req);
        const { id } = SchemaValidator.parse(idParamsSchema, req.params);
        const body = SchemaValidator.parse(setArchivedSchema, req.body);
        return reply.send(await this.service.setArchived(viewer, id, body?.archived ?? true));
    };

    remove = async (req: FastifyRequest, reply: FastifyReply) => {
        const viewer = this.viewer(req);
        const { id } = SchemaValidator.parse(idParamsSchema, req.params);
        await this.service.remove(viewer, id);
        return reply.status(204).send();
    };

    createColumn = async (req: FastifyRequest, reply: FastifyReply) => {
        const viewer = this.viewer(req);
        const { title } = SchemaValidator.parse(columnSchema, req.body);
        return reply.status(201).send(await this.service.createColumn(viewer, title));
    };

    renameColumn = async (req: FastifyRequest, reply: FastifyReply) => {
        const viewer = this.viewer(req);
        const { id } = SchemaValidator.parse(idParamsSchema, req.params);
        const { title } = SchemaValidator.parse(columnSchema, req.body);
        return reply.send(await this.service.renameColumn(viewer, id, title));
    };

    deleteColumn = async (req: FastifyRequest, reply: FastifyReply) => {
        const viewer = this.viewer(req);
        const { id } = SchemaValidator.parse(idParamsSchema, req.params);
        await this.service.deleteColumn(viewer, id);
        return reply.status(204).send();
    };

    private viewer(req: FastifyRequest): Viewer {
        return {
            companyId: requireCompanyId(req),
            userId: req.user.id,
            isAdmin: req.user.profile_tag === 'admin' || req.user.profile_tag === 'superAdmin',
        };
    }
}
