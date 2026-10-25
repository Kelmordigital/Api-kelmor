import { describe, it, expect } from 'vitest';
import { CupomDefinition } from '../../src/modules/cupons/cupom.definition';
import { CupomTypePolicies, CupomTypePolicy, FixoPolicy } from '../../src/modules/cupons/cupom-type.policies';
import type { Cupom } from '../../src/modules/cupons/cupom.db.schema';
import { BadRequestError } from '../../src/core/errors/http-errors';

/** Regras de cupom sem banco: CupomDefinition + políticas por tipo. */

const policies = CupomTypePolicies.default();
const create = (input: Parameters<typeof CupomDefinition.create>[0]) =>
    CupomDefinition.create(input, policies).toPersistence();

const existing = (over: Partial<Cupom> = {}): Cupom => ({
    id: 'id1', company_id: 'c1', code: 'PROMO', type: 'fixo', value: '10.00',
    gift_description: null, min_sale_value: '50.00', is_public: true, is_active: true,
    created_at: new Date(), updated_at: new Date(), ...over,
});

describe('CupomDefinition.create', () => {
    it('normaliza code (trim + maiúsculas) e aplica defaults', () => {
        expect(create({ code: ' promo10 ', value: 10 })).toEqual({
            code: 'PROMO10', type: 'percentual', value: '10', gift_description: null,
            min_sale_value: null, is_public: false, is_active: true,
        });
    });

    it('limite de 50 caracteres é medido antes de normalizar, sem os espaços', () => {
        expect(() => create({ code: ` ${'a'.repeat(50)} `, value: 10 })).not.toThrow();
        expect(() => create({ code: 'a'.repeat(51), value: 10 })).toThrow('code não pode passar de 50 caracteres');
    });

    it('ordem das validações: code → type → benefício do tipo → min_sale_value', () => {
        expect(() => create({ type: 'x', min_sale_value: -1 })).toThrow('code é obrigatório');
        expect(() => create({ code: 'A', type: 'x', min_sale_value: -1 })).toThrow('type inválido');
        expect(() => create({ code: 'A', type: 'fixo', min_sale_value: -1 })).toThrow('value deve ser maior que zero');
        expect(() => create({ code: 'A', type: 'fixo', value: 1, min_sale_value: -1 })).toThrow('min_sale_value não pode ser negativo');
    });

    it('percentual aceita os limites 1 e 100', () => {
        expect(() => create({ code: 'A', value: 1 })).not.toThrow();
        expect(() => create({ code: 'A', value: 100 })).not.toThrow();
        expect(() => create({ code: 'A', value: 100.01 })).toThrow(BadRequestError);
    });

    it('brinde guarda só a descrição (sem espaços); outros tipos descartam a descrição', () => {
        expect(create({ code: 'A', type: 'brinde', value: 9, gift_description: ' Caneca ' }))
            .toMatchObject({ value: null, gift_description: 'Caneca' });
        expect(create({ code: 'A', type: 'fixo', value: 9, gift_description: 'x' }))
            .toMatchObject({ value: '9', gift_description: null });
    });

    it('frete_gratis mantém um value enviado (comportamento herdado)', () => {
        expect(create({ code: 'A', type: 'frete_gratis', value: 3 })).toMatchObject({ value: '3' });
    });
});

describe('CupomDefinition.revise', () => {
    it('campos ausentes mantêm o valor atual', () => {
        const d = CupomDefinition.revise(existing(), { is_active: false }, policies).toPersistence();
        expect(d).toMatchObject({ code: 'PROMO', type: 'fixo', value: '10', min_sale_value: '50', is_public: true, is_active: false });
    });

    it('trocar tipo sem value descarta o value antigo', () => {
        expect(() => CupomDefinition.revise(existing(), { type: 'percentual' }, policies)).toThrow('value deve ser maior que zero');
        const d = CupomDefinition.revise(existing(), { type: 'frete_gratis' }, policies).toPersistence();
        expect(d.value).toBeNull();
    });

    it('min_sale_value: null explícito remove o mínimo', () => {
        const d = CupomDefinition.revise(existing(), { min_sale_value: null }, policies).toPersistence();
        expect(d.min_sale_value).toBeNull();
    });
});

describe('CupomTypePolicies (OCP)', () => {
    it('aceita um tipo novo só registrando uma política', () => {
        class LevaDoisPolicy extends CupomTypePolicy {
            readonly type = 'leva_dois' as never;
        }
        const custom = new CupomTypePolicies([new FixoPolicy(), new LevaDoisPolicy()]);
        expect(() => CupomDefinition.create({ code: 'A', type: 'leva_dois' }, custom)).not.toThrow();
        expect(() => CupomDefinition.create({ code: 'A', type: 'brinde' }, custom)).toThrow('type inválido');
    });
});
