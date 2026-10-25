import type { DB } from '../../database/client';
import { QuickMessage, NewQuickMessage } from './quick-messages.db.schema';
export type QuickMessageData = Omit<NewQuickMessage, 'id' | 'company_id' | 'created_at' | 'updated_at'>;
export type QuickMessagePatch = Partial<QuickMessageData>;
export interface QuickMessageQuery {
    search?: string;
    limit: number;
    offset: number;
}
/** Persistência de mensagens rápidas, sempre escopada pela empresa. */
export interface QuickMessageRepository {
    page(companyId: string, query: QuickMessageQuery): Promise<{
        rows: QuickMessage[];
        total: number;
    }>;
    findById(id: number, companyId: string): Promise<QuickMessage | null>;
    create(companyId: string, data: QuickMessageData): Promise<QuickMessage>;
    update(id: number, companyId: string, patch: QuickMessagePatch): Promise<QuickMessage | null>;
    delete(id: number, companyId: string): Promise<boolean>;
}
export declare class DrizzleQuickMessageRepository implements QuickMessageRepository {
    private readonly db;
    constructor(db: DB);
    page(companyId: string, { search, limit, offset }: QuickMessageQuery): Promise<{
        rows: {
            id: number;
            company_id: string;
            title: string;
            message: string | null;
            media_path: string | null;
            media_type: string | null;
            media_size: number | null;
            created_at: Date | null;
            updated_at: Date | null;
        }[];
        total: number;
    }>;
    findById(id: number, companyId: string): Promise<QuickMessage | null>;
    create(companyId: string, data: QuickMessageData): Promise<QuickMessage>;
    update(id: number, companyId: string, patch: QuickMessagePatch): Promise<QuickMessage | null>;
    delete(id: number, companyId: string): Promise<boolean>;
    private byIdInCompany;
}
//# sourceMappingURL=quick-messages.repository.d.ts.map