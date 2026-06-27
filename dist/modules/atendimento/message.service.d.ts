import { AtMessage } from './atendimento.db.schema';
export declare const messageService: {
    save(ticketId: number, contactId: number | null, body: string, fromMe: boolean, companyId: string, opts?: {
        userId?: string;
        mediaType?: string;
        mediaUrl?: string;
    }): Promise<AtMessage>;
    list(ticketId: number, companyId: string): Promise<AtMessage[]>;
};
//# sourceMappingURL=message.service.d.ts.map