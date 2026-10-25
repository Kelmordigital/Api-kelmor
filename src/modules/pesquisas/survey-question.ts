import type { ResearchAnswer } from './pesquisa.db.schema';

/**
 * A pergunta enviada ao cliente e a leitura da resposta dele. As opções são
 * sempre numeradas na mesma ordem (a de criação), para que "2" signifique a
 * mesma opção na mensagem e na leitura.
 */
export class SurveyQuestion {
    private readonly options: ResearchAnswer[];

    constructor(private readonly title: string, answers: ResearchAnswer[]) {
        this.options = [...answers].sort((a, b) => a.id - b.id);
    }

    get hasOptions(): boolean {
        return this.options.length > 0;
    }

    message(): string {
        const lines = this.options.map((a, i) => `${i + 1}. ${a.title}`).join('\n');
        return `${this.title}\n\n${lines}\n\nResponda com o número da sua opção.`;
    }

    /** O número da opção ou o texto exato dela (sem diferenciar maiúsculas); null se não for resposta. */
    answerFor(reply: string): ResearchAnswer | null {
        const text = reply.trim();
        if (/^\d+$/.test(text)) return this.options[Number(text) - 1] ?? null;
        return this.options.find((a) => a.title.toLowerCase() === text.toLowerCase()) ?? null;
    }
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
export function answerChanges(existing: Pick<ResearchAnswer, 'id' | 'title'>[], titles: string[]): AnswerChanges {
    const available = [...existing].sort((a, b) => a.id - b.id);
    const keepIds: number[] = [];
    const addTitles: string[] = [];
    for (const title of titles) {
        const match = available.findIndex((a) => a.title === title);
        if (match >= 0) keepIds.push(available.splice(match, 1)[0].id);
        else addTitles.push(title);
    }
    return { keepIds, removeIds: available.map((a) => a.id), addTitles };
}
