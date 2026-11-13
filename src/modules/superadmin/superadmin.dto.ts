import { z } from 'zod';

const companyName = z.string().trim().min(2, 'Nome da empresa deve ter ao menos 2 caracteres');
const cnpjCpf = z.string().trim().max(20, 'CNPJ/CPF deve ter no máximo 20 caracteres').nullable().optional();

export const createCompanySchema = z.object({
    name: companyName,
    cnpj_cpf: cnpjCpf,
    admin: z.object({
        name: z.string().trim().min(2, 'Nome do admin deve ter ao menos 2 caracteres'),
        // E-mails valem sem diferenciar maiúsculas (mesma regra do login)
        email: z.string().trim().toLowerCase().pipe(z.email('E-mail do admin inválido')),
        password: z.string().min(8, 'Senha do admin deve ter ao menos 8 caracteres'),
    }, { error: 'Dados do admin são obrigatórios' }),
});

export const updateCompanySchema = z.object({
    name: companyName.optional(),
    cnpj_cpf: cnpjCpf,
});

export const companyStatusSchema = z.object({
    status: z.boolean('status deve ser verdadeiro ou falso'),
});

export const idParamsSchema = z.object({ id: z.guid('id inválido') });

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
