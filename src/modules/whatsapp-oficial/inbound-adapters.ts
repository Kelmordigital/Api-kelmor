import { Readable } from 'stream';
import type Redis from 'ioredis';
import type { MediaStorage } from '../../core/storage/media-storage';
import type { Connection } from '../atendimento/atendimento.db.schema';
import type { GraphApiClient } from './graph-api.client';
import type { CompanyEmitter, ConversationInbox, Deduplicator, InboundMediaStore, InboundMessage, MessageContent } from './whatsapp-oficial-webhook.service';

/** Extensão do arquivo pelo tipo MIME (desconhecido → a parte depois da barra). */
export function extFromMime(mime?: string): string {
    const map: Record<string, string> = {
        'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
        'video/mp4': 'mp4', 'video/3gpp': '3gp',
        'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr',
        'application/pdf': 'pdf',
    };
    const clean = (mime ?? '').split(';')[0].trim();
    return map[clean] ?? (clean.split('/')[1] || 'bin');
}

/**
 * RN-WAB-09: mídia recebida. A Meta manda só o media_id: resolve a URL
 * temporária, baixa com o token da conexão e guarda no storage de mídias
 * (pasta `wab`).
 */
export class CloudMediaStore implements InboundMediaStore {
    constructor(
        private readonly graph: GraphApiClient,
        private readonly storage: MediaStorage,
        private readonly log: (message: string) => void = (m) => console.error(m),
    ) {}

    async fetch(conn: Connection, content: MessageContent, wamid: string): Promise<string | null> {
        if (!content.mediaId || !conn.wab_token) return null;
        try {
            const info = await this.graph.get<{ url?: string; mime_type?: string }>(`/${content.mediaId}`, conn.wab_token);
            if (!info?.url) return null;
            const { buffer, contentType } = await this.graph.download(info.url, conn.wab_token);
            const mime = info.mime_type ?? content.mimeType ?? contentType;
            const ext = content.filename?.includes('.') ? content.filename.split('.').pop()! : extFromMime(mime);
            const stored = await this.storage.save('wab', `${wamid.replace(/[^\w.-]/g, '_')}.${ext}`, mime || 'application/octet-stream', Readable.from(buffer));
            return stored.url;
        } catch (err) {
            this.log(`[WAB:${conn.id}] Erro ao baixar mídia ${content.mediaId}: ${(err as Error).message}`);
            return null;
        }
    }
}

/** Deduplicação no Redis (SET NX com validade); sem Redis, tudo é "primeira vez". */
export class RedisDeduplicator implements Deduplicator {
    constructor(private readonly redis: () => Redis | null) {}

    async firstTime(key: string, ttlSeconds: number): Promise<boolean> {
        const redis = this.redis();
        if (!redis) return true;
        return (await redis.set(key, '1', 'EX', ttlSeconds, 'NX')) !== null;
    }
}

/**
 * Entrega a mensagem recebida ao atendimento, pelo mesmo caminho das outras
 * conexões: contato, ticket aberto, pesquisa pendente, mensagem e bot.
 * Importações tardias evitam ciclo entre os módulos.
 */
export class AtendimentoInbox implements ConversationInbox {
    constructor(
        private readonly emit: CompanyEmitter,
        private readonly log: (message: string) => void = (m) => console.error(m),
    ) {}

    async receive(m: InboundMessage): Promise<{ messageId: number } | null> {
        const { contactService } = await import('../atendimento/contact.service');
        const { ticketService, shouldRunBot } = await import('../atendimento/ticket.service');
        const { messageService } = await import('../atendimento/message.service');
        const { researchSurvey } = await import('../pesquisas/pesquisa.module');

        const contact = await contactService.findOrCreate(m.companyId, m.number, m.name);
        const { ticket } = await ticketService.findOrCreateOpen(m.companyId, contact.id, m.connectionId, undefined, m.origin);
        this.emit(m.companyId, 'contact:upserted', { contact });

        // Pesquisa pendente captura a resposta antes de virar mensagem comum.
        if (await researchSurvey.tryRecordAnswer(m.companyId, contact.id, m.body).catch(() => false)) return null;

        const saved = await messageService.save(ticket.id, contact.id, m.body, false, m.companyId, { mediaType: m.mediaType, mediaUrl: m.mediaUrl });

        // Bot: só com o ticket em status Bot (9); envia pela própria conexão.
        if (m.body && shouldRunBot(ticket)) {
            const { chatbotExecutorService } = await import('../bots/chatbot-executor.service');
            chatbotExecutorService.execute(m.companyId, m.connectionId, m.number, m.body, ticket.id)
                .catch((err: Error) => this.log(`[WAB ChatbotExecutor] Falha silenciosa: ${err.message}`));
        }
        return { messageId: saved.id };
    }
}
