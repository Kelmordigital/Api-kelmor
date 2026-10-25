import { eq, and, ne, desc } from 'drizzle-orm';
import type { DB } from '../../database/client';
import { ConflictError } from '../../core/errors/http-errors';
import { isUniqueViolation } from '../../core/database/pg-errors';
import { cupons, Cupom, NewCupom } from './cupom.db.schema';

export type CupomData = Omit<NewCupom, 'id' | 'company_id' | 'created_at' | 'updated_at'>;

export const DUPLICATE_CODE_MESSAGE = 'Já existe um cupom com esse código';

/** Persistência de cupons, sempre escopada pela empresa. */
export interface CupomRepository {
    listByCompany(companyId: string): Promise<Cupom[]>;
    findById(id: string, companyId: string): Promise<Cupom | null>;
    isCodeTaken(companyId: string, code: string, excludeId?: string): Promise<boolean>;
    /** Lança ConflictError se o código já existe na empresa. */
    create(companyId: string, data: CupomData): Promise<Cupom>;
    /** Lança ConflictError se o código já existe na empresa. */
    update(id: string, companyId: string, data: CupomData): Promise<Cupom | null>;
    delete(id: string, companyId: string): Promise<boolean>;
}

export class DrizzleCupomRepository implements CupomRepository {
    constructor(private readonly db: DB) {}

    async listByCompany(companyId: string): Promise<Cupom[]> {
        return this.db
            .select()
            .from(cupons)
            .where(eq(cupons.company_id, companyId))
            .orderBy(desc(cupons.created_at));
    }

    async findById(id: string, companyId: string): Promise<Cupom | null> {
        const [row] = await this.db
            .select()
            .from(cupons)
            .where(this.byIdInCompany(id, companyId))
            .limit(1);
        return row ?? null;
    }

    async isCodeTaken(companyId: string, code: string, excludeId?: string): Promise<boolean> {
        const conditions = [eq(cupons.company_id, companyId), eq(cupons.code, code)];
        if (excludeId) conditions.push(ne(cupons.id, excludeId));
        const [row] = await this.db
            .select({ id: cupons.id })
            .from(cupons)
            .where(and(...conditions))
            .limit(1);
        return !!row;
    }

    async create(companyId: string, data: CupomData): Promise<Cupom> {
        return this.guardUniqueCode(async () => {
            const [row] = await this.db
                .insert(cupons)
                .values({ ...data, company_id: companyId })
                .returning();
            return row;
        });
    }

    async update(id: string, companyId: string, data: CupomData): Promise<Cupom | null> {
        return this.guardUniqueCode(async () => {
            const [row] = await this.db
                .update(cupons)
                .set({ ...data, updated_at: new Date() })
                .where(this.byIdInCompany(id, companyId))
                .returning();
            return row ?? null;
        });
    }

    async delete(id: string, companyId: string): Promise<boolean> {
        const [row] = await this.db
            .delete(cupons)
            .where(this.byIdInCompany(id, companyId))
            .returning({ id: cupons.id });
        return !!row;
    }

    private byIdInCompany(id: string, companyId: string) {
        return and(eq(cupons.id, id), eq(cupons.company_id, companyId));
    }

    /** Duas requisições simultâneas passam pelo isCodeTaken; o índice único decide. */
    private async guardUniqueCode<T>(write: () => Promise<T>): Promise<T> {
        try {
            return await write();
        } catch (err) {
            if (isUniqueViolation(err)) throw new ConflictError(DUPLICATE_CODE_MESSAGE);
            throw err;
        }
    }
}
