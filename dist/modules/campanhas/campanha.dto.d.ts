import { z } from 'zod';
export declare const campaignIdParamsSchema: z.ZodObject<{
    id: z.ZodCoercedNumber<unknown>;
}, z.core.$strip>;
export declare const createCampaignSchema: z.ZodObject<{
    type: z.ZodOptional<z.ZodString>;
    timezone: z.ZodOptional<z.ZodString>;
    all_contacts: z.ZodOptional<z.ZodBoolean>;
    contact_ids: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
    title: z.ZodString;
    message: z.ZodString;
    send_date: z.ZodString;
    connection_ids: z.ZodArray<z.ZodNumber>;
}, z.core.$strip>;
export declare const updateCampaignSchema: z.ZodObject<{
    type: z.ZodOptional<z.ZodString>;
    timezone: z.ZodOptional<z.ZodString>;
    all_contacts: z.ZodOptional<z.ZodBoolean>;
    contact_ids: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
    title: z.ZodOptional<z.ZodString>;
    message: z.ZodOptional<z.ZodString>;
    send_date: z.ZodOptional<z.ZodString>;
    connection_ids: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
}, z.core.$strip>;
export declare const textIdParamsSchema: z.ZodObject<{
    id: z.ZodCoercedNumber<unknown>;
}, z.core.$strip>;
/** Criar e editar texto: título e mensagem. A ordem (type) é atribuída pela API. */
export declare const textSchema: z.ZodObject<{
    label: z.ZodString;
    text: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
export type TextInput = z.infer<typeof textSchema>;
//# sourceMappingURL=campanha.dto.d.ts.map