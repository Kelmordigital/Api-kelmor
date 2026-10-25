import type { ResearchAnswer } from './pesquisa.db.schema';
/**
 * A pergunta enviada ao cliente e a leitura da resposta dele. As opções são
 * sempre numeradas na mesma ordem (a de criação), para que "2" signifique a
 * mesma opção na mensagem e na leitura.
 */
export declare class SurveyQuestion {
    private readonly title;
    private readonly options;
    constructor(title: string, answers: ResearchAnswer[]);
    get hasOptions(): boolean;
    message(): string;
    /** O número da opção ou o texto exato dela (sem diferenciar maiúsculas); null se não for resposta. */
    answerFor(reply: string): ResearchAnswer | null;
}
export interface AnswerChanges {
    keepIds: number[];
    removeIds: number[];
    addTitles: string[];
}
/**
 * Troca as opções de uma pesquisa mantendo as que continuam (mesmo texto),
 * para não perder o histórico de respostas delas.
 */
export declare function answerChanges(existing: Pick<ResearchAnswer, 'id' | 'title'>[], titles: string[]): AnswerChanges;
//# sourceMappingURL=survey-question.d.ts.map