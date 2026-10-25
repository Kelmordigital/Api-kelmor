"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuickMessageService = void 0;
const http_errors_1 = require("../../core/errors/http-errors");
const NO_MEDIA = { media_path: null, media_type: null, media_size: null };
/**
 * Mensagens rápidas da empresa. O arquivo enviado chega já gravado; se a
 * operação falhar, ele é apagado — nenhum upload fica órfão no storage.
 */
class QuickMessageService {
    repository;
    storage;
    constructor(repository, storage) {
        this.repository = repository;
        this.storage = storage;
    }
    async list(companyId, pagination, search) {
        const { rows, total } = await this.repository.page(companyId, {
            search, limit: pagination.limit, offset: pagination.offset,
        });
        return pagination.toPage(rows, total);
    }
    create(companyId, input, media) {
        return this.discardOnFailure(media, async () => {
            const title = QuickMessageService.requiredTitle(input.title);
            const message = QuickMessageService.text(input.message);
            QuickMessageService.assertHasContent(message, media?.path ?? null);
            return this.repository.create(companyId, {
                title, message, ...QuickMessageService.mediaColumns(media),
            });
        });
    }
    update(id, companyId, input, media) {
        return this.discardOnFailure(media, async () => {
            const existing = QuickMessageService.orNotFound(await this.repository.findById(id, companyId));
            const patch = {};
            if (input.title !== undefined)
                patch.title = QuickMessageService.requiredTitle(input.title);
            if (input.message !== undefined)
                patch.message = QuickMessageService.text(input.message);
            // Arquivo novo vence remove_media
            if (media)
                Object.assign(patch, QuickMessageService.mediaColumns(media));
            else if (input.removeMedia)
                Object.assign(patch, NO_MEDIA);
            QuickMessageService.assertHasContent(patch.message !== undefined ? patch.message : existing.message, patch.media_path !== undefined ? patch.media_path : existing.media_path);
            const updated = QuickMessageService.orNotFound(await this.repository.update(id, companyId, patch));
            if (existing.media_path && existing.media_path !== updated.media_path) {
                await this.storage.delete(existing.media_path);
            }
            return updated;
        });
    }
    async remove(id, companyId) {
        const existing = QuickMessageService.orNotFound(await this.repository.findById(id, companyId));
        if (!(await this.repository.delete(id, companyId)))
            throw QuickMessageService.notFound();
        if (existing.media_path)
            await this.storage.delete(existing.media_path);
    }
    async discardOnFailure(media, operation) {
        try {
            return await operation();
        }
        catch (err) {
            if (media)
                await this.storage.delete(media.path);
            throw err;
        }
    }
    static requiredTitle(raw) {
        const title = raw?.trim();
        if (!title)
            throw new http_errors_1.BadRequestError('Campo "title" é obrigatório');
        return title;
    }
    static text(raw) {
        return raw?.trim() || null;
    }
    /** Uma mensagem rápida precisa ter texto, mídia ou os dois. */
    static assertHasContent(message, mediaPath) {
        if (!message && !mediaPath) {
            throw new http_errors_1.BadRequestError('É obrigatório ter mensagem de texto ou arquivo de mídia');
        }
    }
    static mediaColumns(media) {
        if (!media)
            return NO_MEDIA;
        return { media_path: media.path, media_type: media.mimeType, media_size: media.size };
    }
    static orNotFound(row) {
        if (!row)
            throw QuickMessageService.notFound();
        return row;
    }
    static notFound() {
        return new http_errors_1.NotFoundError('Mensagem rápida não encontrada');
    }
}
exports.QuickMessageService = QuickMessageService;
//# sourceMappingURL=quick-messages.service.js.map