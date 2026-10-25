import { eq, and, asc } from 'drizzle-orm';
import { db } from '../../database/client';
import { atendimento_messages, tickets, AtMessage } from './atendimento.db.schema';
import { emitToCompany } from '../../shared/socket';

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Prefixa `*Nome:*` na mensagem enviada por um atendente (config "Ocultar
 * nome do atendente no chat") — ponto único usado por todo caminho de envio
 * manual (digitação e mensagens rápidas passam pelo mesmo endpoint), pra não
 * reescrever essa regra em mais de um lugar. Não duplica o prefixo se o
 * texto já começar com ele (ex.: atendente reenviando algo já assinado).
 */
export function withAttendantNamePrefix(body: string, name: string): string {
    const already = new RegExp(`^\\*${escapeRegExp(name)}:\\*`, 'i').test(body.trim());
    if (already) return body;
    return `*${name}:*\n${body}`;
}

export const messageService = {
    async save(
        ticketId: number,
        contactId: number | null,
        body: string,
        fromMe: boolean,
        companyId: string,
        opts: {
            userId?: string;
            mediaType?: string;
            mediaUrl?: string;
            mediaWaveform?: number[];
            mediaSeconds?: number;
        } = {},
    ): Promise<AtMessage> {
        const [msg] = await db
            .insert(atendimento_messages)
            .values({
                ticket_id: ticketId,
                contact_id: contactId,
                user_id: opts.userId ?? null,
                body,
                from_me: fromMe,
                media_type: opts.mediaType ?? null,
                media_url: opts.mediaUrl ?? null,
                media_waveform: opts.mediaWaveform ?? null,
                media_seconds: opts.mediaSeconds ?? null,
            })
            .returning();

        await db
            .update(tickets)
            .set({ updated_at: new Date() })
            .where(eq(tickets.id, ticketId));

        emitToCompany(companyId, 'message:created', { message: msg, ticketId });

        if (body && contactId !== null) {
            try {
                const { messageAutoTagger } = await import('../etiquetas/etiqueta.module');
                await messageAutoTagger.applyFor(companyId, contactId, body);
            } catch (err) {
                console.error(
                    `[AutoTags] Falha ao aplicar etiquetas automáticas (ticket ${ticketId}):`,
                    err instanceof Error ? err.message : err,
                );
            }
        }

        return msg;
    },

    async list(ticketId: number, companyId: string): Promise<AtMessage[]> {
        const [ticket] = await db
            .select()
            .from(tickets)
            .where(and(eq(tickets.id, ticketId), eq(tickets.company_id, companyId)))
            .limit(1);

        if (!ticket) throw new Error('Ticket não encontrado');

        return db
            .select()
            .from(atendimento_messages)
            .where(eq(atendimento_messages.ticket_id, ticketId))
            .orderBy(asc(atendimento_messages.created_at));
    },
};
