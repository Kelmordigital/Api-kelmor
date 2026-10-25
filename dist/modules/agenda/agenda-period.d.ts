/**
 * Intervalo da listagem da agenda, com limites inclusivos. Sem datas, vale o
 * mês corrente inteiro: do 1º dia 00:00 até o último dia 23:59:59.999.
 */
export declare class AgendaPeriod {
    readonly start: Date;
    readonly end: Date;
    private constructor();
    static of(start: Date | undefined, end: Date | undefined, now?: Date): AgendaPeriod;
}
//# sourceMappingURL=agenda-period.d.ts.map