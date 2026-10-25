"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.textSchema = exports.textIdParamsSchema = exports.updateCampaignSchema = exports.createCampaignSchema = exports.campaignIdParamsSchema = void 0;
const zod_1 = require("zod");
const isDate = (s) => !Number.isNaN(new Date(s).getTime());
const title = zod_1.z.string({ error: 'O título é obrigatório' }).trim()
    .min(1, 'O título é obrigatório')
    .max(200, 'O título deve ter no máximo 200 caracteres');
const message = zod_1.z.string({ error: 'A mensagem é obrigatória' }).trim().min(1, 'A mensagem é obrigatória');
// A data segue como texto para o microsserviço; aqui só garantimos que é uma data
const sendDate = zod_1.z.string({ error: 'A data de envio é obrigatória' })
    .min(1, 'A data de envio é obrigatória')
    .refine(isDate, 'A data de envio é inválida');
const ids = (field) => zod_1.z.array(zod_1.z.number({ error: `${field} inválido` }).int(`${field} inválido`).positive(`${field} inválido`), { error: `${field} inválido` });
const optional = {
    type: zod_1.z.string({ error: 'type inválido' }).max(50, 'type inválido').optional(),
    timezone: zod_1.z.string({ error: 'timezone inválido' }).max(50, 'timezone inválido').optional(),
    all_contacts: zod_1.z.boolean({ error: 'all_contacts inválido' }).optional(),
    contact_ids: ids('contact_ids').optional(),
};
exports.campaignIdParamsSchema = zod_1.z.object({
    id: zod_1.z.coerce.number({ error: 'id inválido' }).int('id inválido').positive('id inválido'),
});
exports.createCampaignSchema = zod_1.z.object({
    title,
    message,
    send_date: sendDate,
    connection_ids: zod_1.z.array(zod_1.z.number({ error: 'connection_ids inválido' }).int('connection_ids inválido').positive('connection_ids inválido'), { error: 'Selecione ao menos uma conexão' })
        .min(1, 'Selecione ao menos uma conexão'),
    ...optional,
}, { error: 'O título é obrigatório' });
exports.updateCampaignSchema = zod_1.z.object({
    title: title.optional(),
    message: message.optional(),
    send_date: sendDate.optional(),
    connection_ids: ids('connection_ids').optional(),
    ...optional,
}, { error: 'Corpo da requisição inválido' });
exports.textIdParamsSchema = exports.campaignIdParamsSchema;
const label = zod_1.z.string({ error: 'O rótulo é obrigatório' }).trim().min(1, 'O rótulo é obrigatório').max(200, 'O rótulo deve ter no máximo 200 caracteres');
const text = zod_1.z.string({ error: 'text inválido' }).nullish();
/** Criar e editar texto: título e mensagem. A ordem (type) é atribuída pela API. */
exports.textSchema = zod_1.z.object({ label, text }, { error: 'O rótulo é obrigatório' });
//# sourceMappingURL=campanha.dto.js.map