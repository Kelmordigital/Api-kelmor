"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportViewQuerySchema = exports.reportQuerySchema = exports.updateResearchSchema = exports.createResearchSchema = exports.researchIdParamsSchema = void 0;
const zod_1 = require("zod");
const NAME_REQUIRED = 'O nome da pesquisa é obrigatório';
const ANSWERS_REQUIRED = 'Adicione ao menos uma opção de resposta';
const ANSWER_MAX = 200;
const answer = zod_1.z.string({ error: 'As opções de resposta não podem ficar em branco' })
    .trim()
    .min(1, 'As opções de resposta não podem ficar em branco')
    .max(ANSWER_MAX, `Cada opção deve ter no máximo ${ANSWER_MAX} caracteres`);
const queueIds = zod_1.z.array(zod_1.z.number({ error: 'queue_ids inválido' }).int('queue_ids inválido').positive('queue_ids inválido'), { error: 'queue_ids inválido' });
const fields = {
    type: zod_1.z.string({ error: 'type inválido' }).trim().min(1, 'type inválido').max(50, 'type inválido').optional(),
    active: zod_1.z.boolean({ error: 'active inválido' }).optional(),
    default_research: zod_1.z.boolean({ error: 'default_research inválido' }).optional(),
    queue_ids: queueIds.optional(),
};
exports.researchIdParamsSchema = zod_1.z.object({
    id: zod_1.z.coerce.number({ error: 'id inválido' }).int('id inválido').positive('id inválido'),
});
exports.createResearchSchema = zod_1.z.object({
    name: zod_1.z.string({ error: NAME_REQUIRED }).trim().min(1, NAME_REQUIRED),
    answers: zod_1.z.array(answer, { error: ANSWERS_REQUIRED }).min(1, ANSWERS_REQUIRED),
    ...fields,
}, { error: NAME_REQUIRED });
/** Campos ausentes não mudam; `answers` e `queue_ids`, quando enviados, substituem a lista. */
exports.updateResearchSchema = zod_1.z.object({
    name: zod_1.z.string({ error: NAME_REQUIRED }).trim().min(1, NAME_REQUIRED).optional(),
    answers: zod_1.z.array(answer, { error: ANSWERS_REQUIRED }).min(1, ANSWERS_REQUIRED).optional(),
    ...fields,
}, { error: 'Corpo da requisição inválido' });
const day = (field) => zod_1.z.string({ error: `${field} inválido` }).regex(/^\d{4}-\d{2}-\d{2}$/, `${field} inválido`);
exports.reportQuerySchema = zod_1.z.object({
    dateInit: day('dateInit').optional(),
    dateEnd: day('dateEnd').optional(),
    userId: zod_1.z.guid('userId inválido').optional(),
});
exports.reportViewQuerySchema = zod_1.z.object({
    answerId: zod_1.z.coerce.number({ error: 'answerId inválido' }).int('answerId inválido').positive('answerId inválido'),
    dateInit: day('dateInit').optional(),
    dateEnd: day('dateEnd').optional(),
    limit: zod_1.z.coerce.number({ error: 'limit inválido' }).int('limit inválido').min(1, 'limit inválido').max(500, 'limit inválido').optional(),
    offset: zod_1.z.coerce.number({ error: 'offset inválido' }).int('offset inválido').min(0, 'offset inválido').optional(),
});
//# sourceMappingURL=pesquisa.dto.js.map