import { z } from 'zod';
export declare const agendamentoIdParamsSchema: z.ZodObject<{
    id: z.ZodGUID;
}, z.core.$strip>;
export declare const agendaListQuerySchema: z.ZodObject<{
    start: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>;
    end: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>;
}, z.core.$strip>;
/** Presença de start_at/end_at e a ordem entre eles são regra do AgendaService. */
export declare const createAgendamentoSchema: z.ZodObject<{
    lead_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    color: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    notify_on_create: z.ZodOptional<z.ZodBoolean>;
    reminder_minutes: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    remind_at_exact: z.ZodOptional<z.ZodBoolean>;
    notify_groups: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
    title: z.ZodString;
    start_at: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>;
    end_at: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>;
}, z.core.$strip>;
export declare const updateAgendamentoSchema: z.ZodObject<{
    lead_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    color: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    notify_on_create: z.ZodOptional<z.ZodBoolean>;
    reminder_minutes: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    remind_at_exact: z.ZodOptional<z.ZodBoolean>;
    notify_groups: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
    title: z.ZodOptional<z.ZodString>;
    start_at: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>;
    end_at: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>;
}, z.core.$strip>;
export type AgendaListQuery = z.infer<typeof agendaListQuerySchema>;
export type CreateAgendamentoInput = z.infer<typeof createAgendamentoSchema>;
export type UpdateAgendamentoInput = z.infer<typeof updateAgendamentoSchema>;
//# sourceMappingURL=agenda.dto.d.ts.map