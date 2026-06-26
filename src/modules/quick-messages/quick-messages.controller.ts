import { FastifyRequest, FastifyReply } from 'fastify';
import { quickMessageService } from './quick-messages.service';

const ALLOWED_MIMES = new Set([
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'video/mp4', 'audio/mpeg', 'application/pdf',
]);

export const quickMessagesController = {

    async list(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const { page, limit, search } = req.query as {
            page?: string; limit?: string; search?: string;
        };
        const result = await quickMessageService.list(companyId, {
            page:  page  ? Number(page)  : 1,
            limit: limit ? Number(limit) : 10,
            search,
        });
        return reply.send(result);
    },

    async create(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const fields: Record<string, string> = {};
        let savedFile: { filePath: string; size: number } | undefined;
        let fileMime: string | undefined;

        const parts = req.parts();
        for await (const part of parts) {
            if (part.type === 'file') {
                if (!ALLOWED_MIMES.has(part.mimetype)) {
                    part.file.resume();
                    return reply.status(400).send({ error: `Tipo de arquivo não permitido: ${part.mimetype}` });
                }
                savedFile = await quickMessageService.saveFile(companyId, part.filename, part.file);
                fileMime  = part.mimetype;
            } else {
                fields[part.fieldname] = part.value as string;
            }
        }

        const { title, message } = fields;

        if (!title?.trim()) {
            return reply.status(400).send({ error: 'Campo "title" é obrigatório' });
        }
        if (!message?.trim() && !savedFile) {
            return reply.status(400).send({ error: 'É obrigatório ter mensagem de texto ou arquivo de mídia' });
        }

        const qm = await quickMessageService.create(companyId, {
            title:      title.trim(),
            message:    message?.trim() || null,
            media_path: savedFile?.filePath ?? null,
            media_type: fileMime ?? null,
            media_size: savedFile?.size ?? null,
        });

        return reply.status(201).send(qm);
    },

    async update(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const { id }    = req.params as { id: string };
        const fields: Record<string, string> = {};
        let savedFile: { filePath: string; size: number } | undefined;
        let fileMime: string | undefined;

        const parts = req.parts();
        for await (const part of parts) {
            if (part.type === 'file') {
                if (!ALLOWED_MIMES.has(part.mimetype)) {
                    part.file.resume();
                    return reply.status(400).send({ error: `Tipo de arquivo não permitido: ${part.mimetype}` });
                }
                savedFile = await quickMessageService.saveFile(companyId, part.filename, part.file);
                fileMime  = part.mimetype;
            } else {
                fields[part.fieldname] = part.value as string;
            }
        }

        const existing = await quickMessageService.findById(Number(id), companyId);
        if (!existing) return reply.status(404).send({ error: 'Mensagem rápida não encontrada' });

        if (savedFile && existing.media_path) {
            await quickMessageService.deleteFile(existing.media_path);
        }
        if (fields.remove_media === 'true' && !savedFile && existing.media_path) {
            await quickMessageService.deleteFile(existing.media_path);
        }

        const updated = await quickMessageService.update(Number(id), companyId, {
            title:        fields.title?.trim(),
            message:      fields.message !== undefined ? fields.message.trim() || null : undefined,
            media_path:   savedFile?.filePath ?? undefined,
            media_type:   fileMime            ?? undefined,
            media_size:   savedFile?.size     ?? undefined,
            remove_media: fields.remove_media === 'true',
        });

        if (!updated) return reply.status(404).send({ error: 'Mensagem rápida não encontrada' });
        return reply.send(updated);
    },

    async remove(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const { id }    = req.params as { id: string };

        const existing = await quickMessageService.findById(Number(id), companyId);
        if (!existing) return reply.status(404).send({ error: 'Mensagem rápida não encontrada' });

        if (existing.media_path) {
            await quickMessageService.deleteFile(existing.media_path);
        }

        await quickMessageService.remove(Number(id), companyId);
        return reply.status(204).send();
    },
};
