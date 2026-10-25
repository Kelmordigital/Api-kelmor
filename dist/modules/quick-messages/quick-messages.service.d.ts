import type { MediaStorage, StoredFile } from '../../core/storage/media-storage';
import type { Page, Pagination } from '../../core/http/pagination';
import type { QuickMessage } from './quick-messages.db.schema';
import type { QuickMessageRepository } from './quick-messages.repository';
import type { QuickMessageInput } from './quick-messages.dto';
/**
 * Mensagens rápidas da empresa. O arquivo enviado chega já gravado; se a
 * operação falhar, ele é apagado — nenhum upload fica órfão no storage.
 */
export declare class QuickMessageService {
    private readonly repository;
    private readonly storage;
    constructor(repository: QuickMessageRepository, storage: MediaStorage);
    list(companyId: string, pagination: Pagination, search?: string): Promise<Page<QuickMessage>>;
    create(companyId: string, input: QuickMessageInput, media?: StoredFile): Promise<QuickMessage>;
    update(id: number, companyId: string, input: QuickMessageInput, media?: StoredFile): Promise<QuickMessage>;
    remove(id: number, companyId: string): Promise<void>;
    private discardOnFailure;
    private static requiredTitle;
    private static text;
    /** Uma mensagem rápida precisa ter texto, mídia ou os dois. */
    private static assertHasContent;
    private static mediaColumns;
    private static orNotFound;
    private static notFound;
}
//# sourceMappingURL=quick-messages.service.d.ts.map