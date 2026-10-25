import { z } from 'zod';
import type { MultipartForm } from '../../core/http/multipart-form-reader';
export declare const QUICK_MESSAGE_MIME_TYPES: ReadonlySet<string>;
export declare const QUICK_MESSAGE_PAGINATION: {
    defaultLimit: number;
    maxLimit: number;
};
export declare const quickMessageIdParamsSchema: z.ZodObject<{
    id: z.ZodCoercedNumber<unknown>;
}, z.core.$strip>;
export declare const quickMessageListQuerySchema: z.ZodObject<{
    page: z.ZodOptional<z.ZodUnknown>;
    limit: z.ZodOptional<z.ZodUnknown>;
    search: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/** Campos de texto do formulário (multipart só traz strings). */
export interface QuickMessageInput {
    title?: string;
    message?: string;
    removeMedia: boolean;
}
export declare function quickMessageInputFrom(form: MultipartForm): QuickMessageInput;
//# sourceMappingURL=quick-messages.dto.d.ts.map