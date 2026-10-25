import type { Cupom } from './cupom.db.schema';
import type { CupomData } from './cupom.repository';
import type { CupomTypePolicies } from './cupom-type.policies';
import type { CupomInput } from './cupom.dto';
/**
 * Um cupom válido, pronto para gravar. Só nasce por `create` (cupom novo)
 * ou `revise` (cupom existente + alterações), que aplicam todas as regras.
 */
export declare class CupomDefinition {
    private readonly data;
    private constructor();
    get code(): string;
    static create(input: CupomInput, policies: CupomTypePolicies): CupomDefinition;
    /**
     * Campos ausentes no patch mantêm o valor atual. Se o tipo muda e o
     * value não veio, o value antigo é descartado (não faz sentido entre tipos).
     */
    static revise(existing: Cupom, patch: CupomInput, policies: CupomTypePolicies): CupomDefinition;
    toPersistence(): CupomData;
    /** Colunas numeric do Postgres trafegam como string. */
    private static decimal;
    private static number;
}
//# sourceMappingURL=cupom.definition.d.ts.map