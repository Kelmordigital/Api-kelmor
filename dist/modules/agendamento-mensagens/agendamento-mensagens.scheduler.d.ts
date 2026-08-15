/** Agenda o disparo (one-shot) de uma mensagem já gravada no banco. */
export declare function scheduleMessageTask(id: number): Promise<void>;
export declare function cancelMessageTask(id: number): void;
/** Chamado no boot: recria em memória os agendamentos pendentes (o job em memória se perde a cada restart). */
export declare function restoreScheduledMessages(): Promise<void>;
//# sourceMappingURL=agendamento-mensagens.scheduler.d.ts.map