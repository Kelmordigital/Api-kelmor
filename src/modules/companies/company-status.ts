import { eq } from 'drizzle-orm';
import type { DB } from '../../database/client';
import { ForbiddenError } from '../../core/errors/http-errors';
import { companies } from './company.db.schema';

/** Mesma mensagem do login de quem é de empresa desativada. */
export const COMPANY_INACTIVE_MESSAGE = 'Empresa inativa';

export class CompanyInactiveError extends ForbiddenError {
    constructor() { super(COMPANY_INACTIVE_MESSAGE); }
}

/** "A empresa está ativa?" — empresa desativada não faz envios automáticos. */
export interface CompanyStatusReader {
    isActive(companyId: string): Promise<boolean>;
}

export class DrizzleCompanyStatusReader implements CompanyStatusReader {
    constructor(private readonly db: DB) {}

    async isActive(companyId: string): Promise<boolean> {
        const [row] = await this.db.select({ status: companies.status }).from(companies)
            .where(eq(companies.id, companyId)).limit(1);
        return row?.status === true;
    }
}

/** Reação à desativação de uma empresa (encerrar sessões, pausar campanhas…). */
export interface CompanyDeactivationHandler {
    readonly name: string;
    onDeactivated(companyId: string): Promise<void>;
}
