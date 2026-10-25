import { BadRequestError, NotFoundError } from '../../core/errors/http-errors';
import type { MediaStorage, StoredFile } from '../../core/storage/media-storage';
import type { Page, Pagination } from '../../core/http/pagination';
import type { QuickMessage } from './quick-messages.db.schema';
import type { QuickMessagePatch, QuickMessageRepository } from './quick-messages.repository';
import type { QuickMessageInput } from './quick-messages.dto';

const NO_MEDIA = { media_path: null, media_type: null, media_size: null } as const;

/**
 * Mensagens rápidas da empresa. O arquivo enviado chega já gravado; se a
 * operação falhar, ele é apagado — nenhum upload fica órfão no storage.
 */
export class QuickMessageService {
    constructor(
        private readonly repository: QuickMessageRepository,
        private readonly storage: MediaStorage,
    ) {}

    async list(companyId: string, pagination: Pagination, search?: string): Promise<Page<QuickMessage>> {
        const { rows, total } = await this.repository.page(companyId, {
            search, limit: pagination.limit, offset: pagination.offset,
        });
        return pagination.toPage(rows, total);
    }

    create(companyId: string, input: QuickMessageInput, media?: StoredFile): Promise<QuickMessage> {
        return this.discardOnFailure(media, async () => {
            const title = QuickMessageService.requiredTitle(input.title);
            const message = QuickMessageService.text(input.message);
            QuickMessageService.assertHasContent(message, media?.path ?? null);

            return this.repository.create(companyId, {
                title, message, ...QuickMessageService.mediaColumns(media),
            });
        });
    }

    update(id: number, companyId: string, input: QuickMessageInput, media?: StoredFile): Promise<QuickMessage> {
        return this.discardOnFailure(media, async () => {
            const existing = QuickMessageService.orNotFound(await this.repository.findById(id, companyId));

            const patch: QuickMessagePatch = {};
            if (input.title !== undefined) patch.title = QuickMessageService.requiredTitle(input.title);
            if (input.message !== undefined) patch.message = QuickMessageService.text(input.message);
            // Arquivo novo vence remove_media
            if (media) Object.assign(patch, QuickMessageService.mediaColumns(media));
            else if (input.removeMedia) Object.assign(patch, NO_MEDIA);

            QuickMessageService.assertHasContent(
                patch.message !== undefined ? patch.message : existing.message,
                patch.media_path !== undefined ? patch.media_path : existing.media_path,
            );

            const updated = QuickMessageService.orNotFound(await this.repository.update(id, companyId, patch));
            if (existing.media_path && existing.media_path !== updated.media_path) {
                await this.storage.delete(existing.media_path);
            }
            return updated;
        });
    }

    async remove(id: number, companyId: string): Promise<void> {
        const existing = QuickMessageService.orNotFound(await this.repository.findById(id, companyId));
        if (!(await this.repository.delete(id, companyId))) throw QuickMessageService.notFound();
        if (existing.media_path) await this.storage.delete(existing.media_path);
    }

    private async discardOnFailure<T>(media: StoredFile | undefined, operation: () => Promise<T>): Promise<T> {
        try {
            return await operation();
        } catch (err) {
            if (media) await this.storage.delete(media.path);
            throw err;
        }
    }

    private static requiredTitle(raw: string | undefined): string {
        const title = raw?.trim();
        if (!title) throw new BadRequestError('Campo "title" é obrigatório');
        return title;
    }

    private static text(raw: string | undefined): string | null {
        return raw?.trim() || null;
    }

    /** Uma mensagem rápida precisa ter texto, mídia ou os dois. */
    private static assertHasContent(message: string | null, mediaPath: string | null): void {
        if (!message && !mediaPath) {
            throw new BadRequestError('É obrigatório ter mensagem de texto ou arquivo de mídia');
        }
    }

    private static mediaColumns(media: StoredFile | undefined) {
        if (!media) return NO_MEDIA;
        return { media_path: media.path, media_type: media.mimeType, media_size: media.size };
    }

    private static orNotFound(row: QuickMessage | null): QuickMessage {
        if (!row) throw QuickMessageService.notFound();
        return row;
    }

    private static notFound() {
        return new NotFoundError('Mensagem rápida não encontrada');
    }
}
