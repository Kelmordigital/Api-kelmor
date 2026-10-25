/**
 * Palavras-chave de uma regra de etiquetamento automático: variações
 * separadas por vírgula ("fralda, frauda, fraldinha"). A regra dispara se
 * QUALQUER variação aparecer em qualquer ponto da mensagem, sem diferenciar
 * maiúsculas — inclusive dentro de outra palavra ("fralda" casa "fraldas").
 */
export declare class KeywordRule {
    private readonly variations;
    constructor(keywords: string);
    matches(messageText: string): boolean;
}
//# sourceMappingURL=keyword-rule.d.ts.map