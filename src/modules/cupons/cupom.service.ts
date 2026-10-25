import { ConflictError, NotFoundError } from '../../core/errors/http-errors';
import type { Cupom } from './cupom.db.schema';
import { DUPLICATE_CODE_MESSAGE, type CupomRepository } from './cupom.repository';
import type { CupomTypePolicies } from './cupom-type.policies';
import { CupomDefinition } from './cupom.definition';
import type { CupomInput } from './cupom.dto';

export class CupomService {
    constructor(
        private readonly repository: CupomRepository,
        private readonly policies: CupomTypePolicies,
    ) {}

    list(companyId: string): Promise<Cupom[]> {
        return this.repository.listByCompany(companyId);
    }

    async create(companyId: string, input: CupomInput): Promise<Cupom> {
        const cupom = CupomDefinition.create(input, this.policies);
        await this.ensureCodeAvailable(companyId, cupom.code);
        return this.repository.create(companyId, cupom.toPersistence());
    }

    async update(id: string, companyId: string, patch: CupomInput): Promise<Cupom> {
        const existing = this.orNotFound(await this.repository.findById(id, companyId));
        const cupom = CupomDefinition.revise(existing, patch, this.policies);
        await this.ensureCodeAvailable(companyId, cupom.code, id);
        return this.orNotFound(await this.repository.update(id, companyId, cupom.toPersistence()));
    }

    async remove(id: string, companyId: string): Promise<void> {
        if (!(await this.repository.delete(id, companyId))) throw CupomService.notFound();
    }

    private async ensureCodeAvailable(companyId: string, code: string, excludeId?: string): Promise<void> {
        if (await this.repository.isCodeTaken(companyId, code, excludeId)) {
            throw new ConflictError(DUPLICATE_CODE_MESSAGE);
        }
    }

    private orNotFound(row: Cupom | null): Cupom {
        if (!row) throw CupomService.notFound();
        return row;
    }

    private static notFound() {
        return new NotFoundError('Cupom não encontrado');
    }
}
