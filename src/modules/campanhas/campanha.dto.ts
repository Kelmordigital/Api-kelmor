import { z } from 'zod';

const isDate = (s: string) => !Number.isNaN(new Date(s).getTime());

const title = z.string({ error: 'O título é obrigatório' }).trim()
    .min(1, 'O título é obrigatório')
    .max(200, 'O título deve ter no máximo 200 caracteres');
const message = z.string({ error: 'A mensagem é obrigatória' }).trim().min(1, 'A mensagem é obrigatória');
// A data segue como texto para o microsserviço; aqui só garantimos que é uma data
const sendDate = z.string({ error: 'A data de envio é obrigatória' })
    .min(1, 'A data de envio é obrigatória')
    .refine(isDate, 'A data de envio é inválida');
const ids = (field: string) =>
    z.array(z.number({ error: `${field} inválido` }).int(`${field} inválido`).positive(`${field} inválido`), { error: `${field} inválido` });

const optional = {
    type:         z.string({ error: 'type inválido' }).max(50, 'type inválido').optional(),
    timezone:     z.string({ error: 'timezone inválido' }).max(50, 'timezone inválido').optional(),
    all_contacts: z.boolean({ error: 'all_contacts inválido' }).optional(),
    contact_ids:  ids('contact_ids').optional(),
};

export const campaignIdParamsSchema = z.object({
    id: z.coerce.number({ error: 'id inválido' }).int('id inválido').positive('id inválido'),
});

export const createCampaignSchema = z.object({
    title,
    message,
    send_date:      sendDate,
    connection_ids: z.array(z.number({ error: 'connection_ids inválido' }).int('connection_ids inválido').positive('connection_ids inválido'), { error: 'Selecione ao menos uma conexão' })
        .min(1, 'Selecione ao menos uma conexão'),
    ...optional,
}, { error: 'O título é obrigatório' });

export const updateCampaignSchema = z.object({
    title:          title.optional(),
    message:        message.optional(),
    send_date:      sendDate.optional(),
    connection_ids: ids('connection_ids').optional(),
    ...optional,
}, { error: 'Corpo da requisição inválido' });

export const textIdParamsSchema = campaignIdParamsSchema;

const label = z.string({ error: 'O rótulo é obrigatório' }).trim().min(1, 'O rótulo é obrigatório').max(200, 'O rótulo deve ter no máximo 200 caracteres');
const text = z.string({ error: 'text inválido' }).nullish();

/** Criar e editar texto: título e mensagem. A ordem (type) é atribuída pela API. */
export const textSchema = z.object({ label, text }, { error: 'O rótulo é obrigatório' });

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
export type TextInput = z.infer<typeof textSchema>;
