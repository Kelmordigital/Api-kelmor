import { AtMessage } from './atendimento.db.schema';
/**
 * Prefixa `*Nome:*` na mensagem enviada por um atendente (config "Ocultar
 * nome do atendente no chat") — ponto único usado por todo caminho de envio
 * manual (digitação e mensagens rápidas passam pelo mesmo endpoint), pra não
 * reescrever essa regra em mais de um lugar. Não duplica o prefixo se o
 * texto já começar com ele (ex.: atendente reenviando algo já assinado).
 */
export declare function withAttendantNamePrefix(body: string, name: string): string;
export declare const messageService: {
    save(ticketId: number, contactId: number | null, body: string, fromMe: boolean, companyId: string, opts?: {
        userId?: string;
        mediaType?: string;
        mediaUrl?: string;
        mediaWaveform?: number[];
        mediaSeconds?: number;
    }): Promise<AtMessage>;
    list(ticketId: number, companyId: string): Promise<AtMessage[]>;
};
//# sourceMappingURL=message.service.d.ts.map