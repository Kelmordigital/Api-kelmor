import { z } from 'zod';

const NAME_REQUIRED = 'O nome da pesquisa é obrigatório';
const ANSWERS_REQUIRED = 'Adicione ao menos uma opção de resposta';
const ANSWER_MAX = 200;

const answer = z.string({ error: 'As opções de resposta não podem ficar em branco' })
    .trim()
    .min(1, 'As opções de resposta não podem ficar em branco')
    .max(ANSWER_MAX, `Cada opção deve ter no máximo ${ANSWER_MAX} caracteres`);

const queueIds = z.array(
    z.number({ error: 'queue_ids inválido' }).int('queue_ids inválido').positive('queue_ids inválido'),
    { error: 'queue_ids inválido' },
);

const fields = {
    type:             z.string({ error: 'type inválido' }).trim().min(1, 'type inválido').max(50, 'type inválido').optional(),
    active:           z.boolean({ error: 'active inválido' }).optional(),
    default_research: z.boolean({ error: 'default_research inválido' }).optional(),
    queue_ids:        queueIds.optional(),
};

export const researchIdParamsSchema = z.object({
    id: z.coerce.number({ error: 'id inválido' }).int('id inválido').positive('id inválido'),
});

export const createResearchSchema = z.object({
    name:    z.string({ error: NAME_REQUIRED }).trim().min(1, NAME_REQUIRED),
    answers: z.array(answer, { error: ANSWERS_REQUIRED }).min(1, ANSWERS_REQUIRED),
    ...fields,
}, { error: NAME_REQUIRED });

/** Campos ausentes não mudam; `answers` e `queue_ids`, quando enviados, substituem a lista. */
export const updateResearchSchema = z.object({
    name:    z.string({ error: NAME_REQUIRED }).trim().min(1, NAME_REQUIRED).optional(),
    answers: z.array(answer, { error: ANSWERS_REQUIRED }).min(1, ANSWERS_REQUIRED).optional(),
    ...fields,
}, { error: 'Corpo da requisição inválido' });

const day = (field: string) => z.string({ error: `${field} inválido` }).regex(/^\d{4}-\d{2}-\d{2}$/, `${field} inválido`);

export const reportQuerySchema = z.object({
    dateInit: day('dateInit').optional(),
    dateEnd:  day('dateEnd').optional(),
    userId:   z.guid('userId inválido').optional(),
});

export const reportViewQuerySchema = z.object({
    answerId: z.coerce.number({ error: 'answerId inválido' }).int('answerId inválido').positive('answerId inválido'),
    dateInit: day('dateInit').optional(),
    dateEnd:  day('dateEnd').optional(),
    limit:    z.coerce.number({ error: 'limit inválido' }).int('limit inválido').min(1, 'limit inválido').max(500, 'limit inválido').optional(),
    offset:   z.coerce.number({ error: 'offset inválido' }).int('offset inválido').min(0, 'offset inválido').optional(),
});

export type CreateResearchInput = z.infer<typeof createResearchSchema>;
export type UpdateResearchInput = z.infer<typeof updateResearchSchema>;
export type ReportQuery = z.infer<typeof reportQuerySchema>;
export type ReportViewQuery = z.infer<typeof reportViewQuerySchema>;
