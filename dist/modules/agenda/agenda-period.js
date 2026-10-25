"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgendaPeriod = void 0;
/**
 * Intervalo da listagem da agenda, com limites inclusivos. Sem datas, vale o
 * mês corrente inteiro: do 1º dia 00:00 até o último dia 23:59:59.999.
 */
class AgendaPeriod {
    start;
    end;
    constructor(start, end) {
        this.start = start;
        this.end = end;
    }
    static of(start, end, now = new Date()) {
        const year = now.getFullYear();
        const month = now.getMonth();
        return new AgendaPeriod(start ?? new Date(year, month, 1), end ?? new Date(new Date(year, month + 1, 1).getTime() - 1));
    }
}
exports.AgendaPeriod = AgendaPeriod;
//# sourceMappingURL=agenda-period.js.map