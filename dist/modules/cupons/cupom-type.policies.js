"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CupomTypePolicies = exports.BrindePolicy = exports.FreteGratisPolicy = exports.PercentualPolicy = exports.FixoPolicy = exports.CupomTypePolicy = void 0;
const http_errors_1 = require("../../core/errors/http-errors");
/**
 * Regra de um tipo de cupom: o que ele exige e o que ele guarda.
 * Todo tipo é intercambiável (LSP); um tipo novo é uma classe nova
 * registrada em CupomTypePolicies, sem tocar no resto (OCP).
 */
class CupomTypePolicy {
    /** Lança BadRequestError se o benefício não serve para este tipo. */
    validate(_benefit) { }
    /** Benefício como deve ser persistido para este tipo. */
    normalize(benefit) {
        return { value: benefit.value, gift_description: null };
    }
}
exports.CupomTypePolicy = CupomTypePolicy;
class MonetaryDiscountPolicy extends CupomTypePolicy {
    validate({ value }) {
        if (value == null || value <= 0) {
            throw new http_errors_1.BadRequestError('value deve ser maior que zero para este tipo de cupom');
        }
    }
}
class FixoPolicy extends MonetaryDiscountPolicy {
    type = 'fixo';
}
exports.FixoPolicy = FixoPolicy;
class PercentualPolicy extends MonetaryDiscountPolicy {
    type = 'percentual';
    validate(benefit) {
        super.validate(benefit);
        if (benefit.value < 1 || benefit.value > 100) {
            throw new http_errors_1.BadRequestError('value (percentual) deve estar entre 1 e 100');
        }
    }
}
exports.PercentualPolicy = PercentualPolicy;
/** Frete grátis não exige valor; um value enviado é mantido como veio. */
class FreteGratisPolicy extends CupomTypePolicy {
    type = 'frete_gratis';
}
exports.FreteGratisPolicy = FreteGratisPolicy;
class BrindePolicy extends CupomTypePolicy {
    type = 'brinde';
    validate({ gift_description }) {
        if (!gift_description?.trim()) {
            throw new http_errors_1.BadRequestError('gift_description é obrigatório para cupons do tipo brinde');
        }
    }
    normalize({ gift_description }) {
        return { value: null, gift_description: gift_description.trim() };
    }
}
exports.BrindePolicy = BrindePolicy;
class CupomTypePolicies {
    byType;
    constructor(policies) {
        this.byType = new Map(policies.map((p) => [p.type, p]));
    }
    static default() {
        return new CupomTypePolicies([new FixoPolicy(), new PercentualPolicy(), new FreteGratisPolicy(), new BrindePolicy()]);
    }
    for(type) {
        const policy = this.byType.get(type);
        if (!policy)
            throw new http_errors_1.BadRequestError('type inválido');
        return policy;
    }
}
exports.CupomTypePolicies = CupomTypePolicies;
//# sourceMappingURL=cupom-type.policies.js.map