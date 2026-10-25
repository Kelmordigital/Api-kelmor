"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SurveyQuestion = void 0;
exports.answerChanges = answerChanges;
/**
 * A pergunta enviada ao cliente e a leitura da resposta dele. As opções são
 * sempre numeradas na mesma ordem (a de criação), para que "2" signifique a
 * mesma opção na mensagem e na leitura.
 */
class SurveyQuestion {
    title;
    options;
    constructor(title, answers) {
        this.title = title;
        this.options = [...answers].sort((a, b) => a.id - b.id);
    }
    get hasOptions() {
        return this.options.length > 0;
    }
    message() {
        const lines = this.options.map((a, i) => `${i + 1}. ${a.title}`).join('\n');
        return `${this.title}\n\n${lines}\n\nResponda com o número da sua opção.`;
    }
    /** O número da opção ou o texto exato dela (sem diferenciar maiúsculas); null se não for resposta. */
    answerFor(reply) {
        const text = reply.trim();
        if (/^\d+$/.test(text))
            return this.options[Number(text) - 1] ?? null;
        return this.options.find((a) => a.title.toLowerCase() === text.toLowerCase()) ?? null;
    }
}
exports.SurveyQuestion = SurveyQuestion;
/**
 * Troca as opções de uma pesquisa mantendo as que continuam (mesmo texto),
 * para não perder o histórico de respostas delas.
 */
function answerChanges(existing, titles) {
    const available = [...existing].sort((a, b) => a.id - b.id);
    const keepIds = [];
    const addTitles = [];
    for (const title of titles) {
        const match = available.findIndex((a) => a.title === title);
        if (match >= 0)
            keepIds.push(available.splice(match, 1)[0].id);
        else
            addTitles.push(title);
    }
    return { keepIds, removeIds: available.map((a) => a.id), addTitles };
}
//# sourceMappingURL=survey-question.js.map