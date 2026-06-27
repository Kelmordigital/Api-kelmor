import { QuickMessage } from './quick-messages.db.schema';
import { Readable } from 'stream';
interface ListParams {
    page?: number;
    limit?: number;
    search?: string;
}
interface CreatePayload {
    title: string;
    message?: string | null;
    media_path?: string | null;
    media_type?: string | null;
    media_size?: number | null;
}
interface UpdatePayload {
    title?: string;
    message?: string | null;
    media_path?: string | null;
    media_type?: string | null;
    media_size?: number | null;
    remove_media?: boolean;
}
export declare const quickMessageService: {
    list(companyId: string, params?: ListParams): Promise<{
        data: {
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
        page: number;
        limit: number;
        totalPages: number;
    }>;
    findById(id: number, companyId: string): Promise<QuickMessage | undefined>;
    create(companyId: string, payload: CreatePayload): Promise<QuickMessage>;
    update(id: number, companyId: string, payload: UpdatePayload): Promise<QuickMessage | null>;
    remove(id: number, companyId: string): Promise<QuickMessage | null>;
    saveFile(companyId: string, originalName: string, stream: Readable): Promise<{
        filePath: string;
        size: number;
    }>;
    deleteFile(mediaPath: string): Promise<void>;
};
export {};
//# sourceMappingURL=quick-messages.service.d.ts.map