import { z } from 'zod';
export declare const idParamsSchema: z.ZodObject<{
    id: z.ZodGUID;
}, z.core.$strip>;
export declare const contactParamsSchema: z.ZodObject<{
    contactId: z.ZodCoercedNumber<unknown>;
}, z.core.$strip>;
export declare const ownerQuerySchema: z.ZodObject<{
    owner_id: z.ZodOptional<z.ZodGUID>;
}, z.core.$strip>;
export declare const createTaskSchema: z.ZodObject<{
    titulo: z.ZodString;
    descricao: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    contact_id: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    due_date: z.ZodOptional<z.ZodNullable<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>>;
    column_id: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const updateTaskSchema: z.ZodObject<{
    titulo: z.ZodOptional<z.ZodString>;
    descricao: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    contact_id: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    due_date: z.ZodOptional<z.ZodNullable<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>>;
}, z.core.$strip>;
export declare const moveTaskSchema: z.ZodObject<{
    column_id: z.ZodString;
    index: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
/** Corpo opcional: sem `done`/`archived`, vale true. */
export declare const setDoneSchema: z.ZodOptional<z.ZodNullable<z.ZodObject<{
    done: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>>>;
export declare const setArchivedSchema: z.ZodOptional<z.ZodNullable<z.ZodObject<{
    archived: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>>>;
export declare const columnSchema: z.ZodObject<{
    title: z.ZodString;
}, z.core.$strip>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
//# sourceMappingURL=tarefas.dto.d.ts.map