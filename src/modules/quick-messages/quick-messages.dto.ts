import { z } from 'zod';
import type { MultipartForm } from '../../core/http/multipart-form-reader';

export const QUICK_MESSAGE_MIME_TYPES: ReadonlySet<string> = new Set([
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'video/mp4', 'audio/mpeg', 'application/pdf',
]);

export const QUICK_MESSAGE_PAGINATION = { defaultLimit: 10, maxLimit: 50 };

export const quickMessageIdParamsSchema = z.object({
    id: z.coerce.number({ error: 'id inválido' }).int('id inválido').positive('id inválido'),
});

export const quickMessageListQuerySchema = z.object({
    page:   z.unknown().optional(),
    limit:  z.unknown().optional(),
    search: z.string().optional(),
});

/** Campos de texto do formulário (multipart só traz strings). */
export interface QuickMessageInput {
    title?: string;
    message?: string;
    removeMedia: boolean;
}

export function quickMessageInputFrom(form: MultipartForm): QuickMessageInput {
    return {
        title:       form.fields.title,
        message:     form.fields.message,
        removeMedia: form.fields.remove_media === 'true',
    };
}
