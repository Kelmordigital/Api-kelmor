import type { CupomType } from './cupom.db.schema';
/** Campos de um cupom que variam de significado conforme o tipo. */
export interface CupomBenefit {
    value: number | null;
    gift_description: string | null;
}
/**
 * Regra de um tipo de cupom: o que ele exige e o que ele guarda.
 * Todo tipo é intercambiável (LSP); um tipo novo é uma classe nova
 * registrada em CupomTypePolicies, sem tocar no resto (OCP).
 */
export declare abstract class CupomTypePolicy {
    abstract readonly type: CupomType;
    /** Lança BadRequestError se o benefício não serve para este tipo. */
    validate(_benefit: CupomBenefit): void;
    /** Benefício como deve ser persistido para este tipo. */
    normalize(benefit: CupomBenefit): CupomBenefit;
}
declare abstract class MonetaryDiscountPolicy extends CupomTypePolicy {
    validate({ value }: CupomBenefit): void;
}
export declare class FixoPolicy extends MonetaryDiscountPolicy {
    readonly type = "fixo";
}
export declare class PercentualPolicy extends MonetaryDiscountPolicy {
    readonly type = "percentual";
    validate(benefit: CupomBenefit): void;
}
/** Frete grátis não exige valor; um value enviado é mantido como veio. */
export declare class FreteGratisPolicy extends CupomTypePolicy {
    readonly type = "frete_gratis";
}
export declare class BrindePolicy extends CupomTypePolicy {
    readonly type = "brinde";
    validate({ gift_description }: CupomBenefit): void;
    normalize({ gift_description }: CupomBenefit): CupomBenefit;
}
export declare class CupomTypePolicies {
    private readonly byType;
    constructor(policies: CupomTypePolicy[]);
    static default(): CupomTypePolicies;
    for(type: CupomType): CupomTypePolicy;
}
export {};
//# sourceMappingURL=cupom-type.policies.d.ts.map