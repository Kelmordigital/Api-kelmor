/**
 * Valor de venda no formato brasileiro, como digitado na tela ("1.500,00",
 * "150", "99,9"). Guardado como texto; somado nos relatórios (RN-CRM-07).
 */
export class SalePrice {
    static readonly FORMAT_MESSAGE = 'Valor inválido. Use o formato 1.500,00';

    /** Milhar com ponto (opcional) e até 2 casas depois da vírgula. "150.50" é ambíguo e é recusado. */
    static isValid(text: string): boolean {
        return /^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/.test(text.trim());
    }

    /** Valor numérico; vazio ou fora do formato conta como zero. */
    static toNumber(text: string | null | undefined): number {
        if (!text) return 0;
        const n = parseFloat(text.replace(/\./g, '').replace(',', '.'));
        return Number.isNaN(n) ? 0 : n;
    }
}
