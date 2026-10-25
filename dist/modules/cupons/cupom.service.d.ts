import type { Cupom } from './cupom.db.schema';
import { type CupomRepository } from './cupom.repository';
import type { CupomTypePolicies } from './cupom-type.policies';
import type { CupomInput } from './cupom.dto';
export declare class CupomService {
    private readonly repository;
    private readonly policies;
    constructor(repository: CupomRepository, policies: CupomTypePolicies);
    list(companyId: string): Promise<Cupom[]>;
    create(companyId: string, input: CupomInput): Promise<Cupom>;
    update(id: string, companyId: string, patch: CupomInput): Promise<Cupom>;
    remove(id: string, companyId: string): Promise<void>;
    private ensureCodeAvailable;
    private orNotFound;
    private static notFound;
}
//# sourceMappingURL=cupom.service.d.ts.map