"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.quickMessagesController = void 0;
const quick_messages_service_1 = require("./quick-messages.service");
const ALLOWED_MIMES = new Set([
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'video/mp4', 'audio/mpeg', 'application/pdf',
]);
exports.quickMessagesController = {
    async list(req, reply) {
        const companyId = req.user.company_id;
        const { page, limit, search } = req.query;
        const result = await quick_messages_service_1.quickMessageService.list(companyId, {
            page: page ? Number(page) : 1,
            limit: limit ? Number(limit) : 10,
            search,
        });
        return reply.send(result);
    },
    async create(req, reply) {
        const companyId = req.user.company_id;
        const fields = {};
        let savedFile;
        let fileMime;
        const parts = req.parts();
        for await (const part of parts) {
            if (part.type === 'file') {
                if (!ALLOWED_MIMES.has(part.mimetype)) {
                    part.file.resume();
                    return reply.status(400).send({ error: `Tipo de arquivo não permitido: ${part.mimetype}` });
                }
                savedFile = await quick_messages_service_1.quickMessageService.saveFile(companyId, part.filename, part.file);
                fileMime = part.mimetype;
            }
            else {
                fields[part.fieldname] = part.value;
            }
        }
        const { title, message } = fields;
        if (!title?.trim()) {
            return reply.status(400).send({ error: 'Campo "title" é obrigatório' });
        }
        if (!message?.trim() && !savedFile) {
            return reply.status(400).send({ error: 'É obrigatório ter mensagem de texto ou arquivo de mídia' });
        }
        const qm = await quick_messages_service_1.quickMessageService.create(companyId, {
            title: title.trim(),
            message: message?.trim() || null,
            media_path: savedFile?.filePath ?? null,
            media_type: fileMime ?? null,
            media_size: savedFile?.size ?? null,
        });
        return reply.status(201).send(qm);
    },
    async update(req, reply) {
        const companyId = req.user.company_id;
        const { id } = req.params;
        const fields = {};
        let savedFile;
        let fileMime;
        const parts = req.parts();
        for await (const part of parts) {
            if (part.type === 'file') {
                if (!ALLOWED_MIMES.has(part.mimetype)) {
                    part.file.resume();
                    return reply.status(400).send({ error: `Tipo de arquivo não permitido: ${part.mimetype}` });
                }
                savedFile = await quick_messages_service_1.quickMessageService.saveFile(companyId, part.filename, part.file);
                fileMime = part.mimetype;
            }
            else {
                fields[part.fieldname] = part.value;
            }
        }
        const existing = await quick_messages_service_1.quickMessageService.findById(Number(id), companyId);
        if (!existing)
            return reply.status(404).send({ error: 'Mensagem rápida não encontrada' });
        if (savedFile && existing.media_path) {
            await quick_messages_service_1.quickMessageService.deleteFile(existing.media_path);
        }
        if (fields.remove_media === 'true' && !savedFile && existing.media_path) {
            await quick_messages_service_1.quickMessageService.deleteFile(existing.media_path);
        }
        const updated = await quick_messages_service_1.quickMessageService.update(Number(id), companyId, {
            title: fields.title?.trim(),
            message: fields.message !== undefined ? fields.message.trim() || null : undefined,
            media_path: savedFile?.filePath ?? undefined,
            media_type: fileMime ?? undefined,
            media_size: savedFile?.size ?? undefined,
            remove_media: fields.remove_media === 'true',
        });
        if (!updated)
            return reply.status(404).send({ error: 'Mensagem rápida não encontrada' });
        return reply.send(updated);
    },
    async remove(req, reply) {
        const companyId = req.user.company_id;
        const { id } = req.params;
        const existing = await quick_messages_service_1.quickMessageService.findById(Number(id), companyId);
        if (!existing)
            return reply.status(404).send({ error: 'Mensagem rápida não encontrada' });
        if (existing.media_path) {
            await quick_messages_service_1.quickMessageService.deleteFile(existing.media_path);
        }
        await quick_messages_service_1.quickMessageService.remove(Number(id), companyId);
        return reply.status(204).send();
    },
};
//# sourceMappingURL=quick-messages.controller.js.map