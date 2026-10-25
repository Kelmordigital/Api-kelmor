/**
 * Intervalo da listagem da agenda, com limites inclusivos. Sem datas, vale o
 * mês corrente inteiro: do 1º dia 00:00 até o último dia 23:59:59.999.
 */
export class AgendaPeriod {
    private constructor(readonly start: Date, readonly end: Date) {}

    static of(start: Date | undefined, end: Date | undefined, now: Date = new Date()): AgendaPeriod {
        const year = now.getFullYear();
        const month = now.getMonth();
        return new AgendaPeriod(
            start ?? new Date(year, month, 1),
            end ?? new Date(new Date(year, month + 1, 1).getTime() - 1),
        );
    }
}
