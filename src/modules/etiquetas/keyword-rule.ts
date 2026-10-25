/**
 * Palavras-chave de uma regra de etiquetamento automático: variações
 * separadas por vírgula ("fralda, frauda, fraldinha"). A regra dispara se
 * QUALQUER variação aparecer em qualquer ponto da mensagem, sem diferenciar
 * maiúsculas — inclusive dentro de outra palavra ("fralda" casa "fraldas").
 */
export class KeywordRule {
    private readonly variations: string[];

    constructor(keywords: string) {
        this.variations = keywords.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);
    }

    matches(messageText: string): boolean {
        const text = messageText.toLowerCase();
        return this.variations.some((v) => text.includes(v));
    }
}
