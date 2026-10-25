"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KeywordRule = void 0;
/**
 * Palavras-chave de uma regra de etiquetamento automático: variações
 * separadas por vírgula ("fralda, frauda, fraldinha"). A regra dispara se
 * QUALQUER variação aparecer em qualquer ponto da mensagem, sem diferenciar
 * maiúsculas — inclusive dentro de outra palavra ("fralda" casa "fraldas").
 */
class KeywordRule {
    variations;
    constructor(keywords) {
        this.variations = keywords.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);
    }
    matches(messageText) {
        const text = messageText.toLowerCase();
        return this.variations.some((v) => text.includes(v));
    }
}
exports.KeywordRule = KeywordRule;
//# sourceMappingURL=keyword-rule.js.map