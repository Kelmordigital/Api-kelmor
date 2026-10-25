import { BadRequestError } from '../../core/errors/http-errors';
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
export abstract class CupomTypePolicy {
    abstract readonly type: CupomType;

    /** Lança BadRequestError se o benefício não serve para este tipo. */
    validate(_benefit: CupomBenefit): void {}

    /** Benefício como deve ser persistido para este tipo. */
    normalize(benefit: CupomBenefit): CupomBenefit {
        return { value: benefit.value, gift_description: null };
    }
}

abstract class MonetaryDiscountPolicy extends CupomTypePolicy {
    validate({ value }: CupomBenefit): void {
        if (value == null || value <= 0) {
            throw new BadRequestError('value deve ser maior que zero para este tipo de cupom');
        }
    }
}

export class FixoPolicy extends MonetaryDiscountPolicy {
    readonly type = 'fixo';
}

export class PercentualPolicy extends MonetaryDiscountPolicy {
    readonly type = 'percentual';

    validate(benefit: CupomBenefit): void {
        super.validate(benefit);
        if (benefit.value! < 1 || benefit.value! > 100) {
            throw new BadRequestError('value (percentual) deve estar entre 1 e 100');
        }
    }
}

/** Frete grátis não exige valor; um value enviado é mantido como veio. */
export class FreteGratisPolicy extends CupomTypePolicy {
    readonly type = 'frete_gratis';
}

export class BrindePolicy extends CupomTypePolicy {
    readonly type = 'brinde';

    validate({ gift_description }: CupomBenefit): void {
        if (!gift_description?.trim()) {
            throw new BadRequestError('gift_description é obrigatório para cupons do tipo brinde');
        }
    }

    normalize({ gift_description }: CupomBenefit): CupomBenefit {
        return { value: null, gift_description: gift_description!.trim() };
    }
}

export class CupomTypePolicies {
    private readonly byType: ReadonlyMap<CupomType, CupomTypePolicy>;

    constructor(policies: CupomTypePolicy[]) {
        this.byType = new Map(policies.map((p) => [p.type, p]));
    }

    static default(): CupomTypePolicies {
        return new CupomTypePolicies([new FixoPolicy(), new PercentualPolicy(), new FreteGratisPolicy(), new BrindePolicy()]);
    }

    for(type: CupomType): CupomTypePolicy {
        const policy = this.byType.get(type);
        if (!policy) throw new BadRequestError('type inválido');
        return policy;
    }
}
