import { z } from 'zod';
export declare const MESSAGE_MAX_LENGTH = 4096;
export declare const ticketIdParamsSchema: z.ZodObject<{
    id: z.ZodCoercedNumber<unknown>;
}, z.core.$strip>;
export declare const scheduleMessageSchema: z.ZodObject<{
    message: z.ZodString;
    send_date: z.ZodString;
}, z.core.$strip>;
export declare const scheduledIdParamsSchema: z.ZodObject<{
    id: z.ZodCoercedNumber<unknown>;
}, z.core.$strip>;
export declare const updateScheduledMessageSchema: z.ZodObject<{
    message: z.ZodOptional<z.ZodString>;
    send_date: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
//# sourceMappingURL=agendamento-mensagens.dto.d.ts.map