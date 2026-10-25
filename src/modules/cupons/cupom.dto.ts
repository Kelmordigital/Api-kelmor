import { z } from 'zod';

/**
 * Só a forma da entrada. Presença, limites e regras por tipo ficam em
 * CupomDefinition/CupomTypePolicy — a ordem das mensagens é regra de domínio.
 */
const amount = (field: string) => z.number({ error: `${field} deve ser um número` }).nullish();

export const cupomIdParamsSchema = z.object({
    id: z.guid('id inválido'),
});

export const cupomInputSchema = z.object({
    code:             z.string({ error: 'code é obrigatório' }).optional(),
    type:             z.string({ error: 'type inválido' }).optional(),
    value:            amount('value'),
    gift_description: z.string({ error: 'gift_description deve ser texto' }).nullish(),
    min_sale_value:   amount('min_sale_value'),
    is_public:        z.boolean().optional(),
    is_active:        z.boolean().optional(),
}, { error: 'Corpo da requisição inválido' });

export type CupomInput = z.infer<typeof cupomInputSchema>;
