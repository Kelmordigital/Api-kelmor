"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CupomDefinition = void 0;
const http_errors_1 = require("../../core/errors/http-errors");
const CODE_MAX_LENGTH = 50;
const DEFAULT_TYPE = 'percentual';
/**
 * Um cupom válido, pronto para gravar. Só nasce por `create` (cupom novo)
 * ou `revise` (cupom existente + alterações), que aplicam todas as regras.
 */
class CupomDefinition {
    data;
    constructor(data) {
        this.data = data;
    }
    get code() {
        return this.data.code;
    }
    static create(input, policies) {
        const code = input.code?.trim();
        if (!code)
            throw new http_errors_1.BadRequestError('code é obrigatório');
        if (code.length > CODE_MAX_LENGTH)
            throw new http_errors_1.BadRequestError(`code não pode passar de ${CODE_MAX_LENGTH} caracteres`);
        const type = (input.type ?? DEFAULT_TYPE);
        const policy = policies.for(type);
        const benefit = { value: input.value ?? null, gift_description: input.gift_description ?? null };
        policy.validate(benefit);
        if (input.min_sale_value != null && input.min_sale_value < 0) {
            throw new http_errors_1.BadRequestError('min_sale_value não pode ser negativo');
        }
        const normalized = policy.normalize(benefit);
        return new CupomDefinition({
            code: code.toUpperCase(),
            type,
            value: CupomDefinition.decimal(normalized.value),
            gift_description: normalized.gift_description,
            min_sale_value: CupomDefinition.decimal(input.min_sale_value),
            is_public: input.is_public ?? false,
            is_active: input.is_active ?? true,
        });
    }
    /**
     * Campos ausentes no patch mantêm o valor atual. Se o tipo muda e o
     * value não veio, o value antigo é descartado (não faz sentido entre tipos).
     */
    static revise(existing, patch, policies) {
        const typeChanged = patch.type !== undefined && patch.type !== existing.type;
        const keptValue = typeChanged ? null : CupomDefinition.number(existing.value);
        return CupomDefinition.create({
            code: patch.code ?? existing.code,
            type: patch.type ?? existing.type,
            value: patch.value !== undefined ? patch.value : keptValue,
            gift_description: patch.gift_description !== undefined ? patch.gift_description : existing.gift_description,
            min_sale_value: patch.min_sale_value !== undefined ? patch.min_sale_value : CupomDefinition.number(existing.min_sale_value),
            is_public: patch.is_public ?? existing.is_public,
            is_active: patch.is_active ?? existing.is_active,
        }, policies);
    }
    toPersistence() {
        return { ...this.data };
    }
    /** Colunas numeric do Postgres trafegam como string. */
    static decimal(n) {
        return n != null ? String(n) : null;
    }
    static number(s) {
        return s != null ? Number(s) : null;
    }
}
exports.CupomDefinition = CupomDefinition;
//# sourceMappingURL=cupom.definition.js.map