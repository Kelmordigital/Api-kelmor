import { and, eq } from 'drizzle-orm';
import type Redis from 'ioredis';
import type { DB } from '../../database/client';
import { atendimento_messages, connection_errors_log, connections, type Connection } from '../atendimento/atendimento.db.schema';

export type OfficialConnectionValues = {
    company_id: string;
    name: string;
    type: 'whatsapp-oficial';
    status: 'connected';
    wab_connection: true;
    wab_business_id: string;
    wab_business_phonenumber_id: string;
    wab_business_number: string | null;
    wab_token: string;
    wab_is_registered: boolean;
};

/** Conexões da API Oficial. */
export interface OfficialConnectionRepository {
    findById(id: number): Promise<Connection | null>;
    /** Sem cache: a conexão oficial do número (de qualquer empresa). */
    findByPhoneNumberId(phoneNumberId: string): Promise<Connection | null>;
    create(values: OfficialConnectionValues): Promise<Connection>;
    update(id: number, values: OfficialConnectionValues): Promise<Connection>;
}

export class DrizzleOfficialConnections implements OfficialConnectionRepository {
    constructor(private readonly db: DB) {}

    async findById(id: number) {
        const [row] = await this.db.select().from(connections).where(eq(connections.id, id)).limit(1);
        return row ?? null;
    }

    async findByPhoneNumberId(phoneNumberId: string) {
        const [row] = await this.db.select().from(connections)
            .where(and(eq(connections.wab_business_phonenumber_id, phoneNumberId), eq(connections.type, 'whatsapp-oficial')))
            .limit(1);
        return row ?? null;
    }

    async create(values: OfficialConnectionValues) {
        const [row] = await this.db.insert(connections).values(values).returning();
        return row;
    }

    async update(id: number, values: OfficialConnectionValues) {
        const [row] = await this.db.update(connections).set(values).where(eq(connections.id, id)).returning();
        return row;
    }
}

/**
 * RN-WAB-07: conexão pelo phone_number_id do webhook, com cache no Redis por 4 h
 * (inclusive o "não existe", para webhooks de números que não são nossos).
 */
export class CachedConnectionLookup {
    private static readonly TTL_SECONDS = 60 * 60 * 4;

    constructor(
        private readonly repository: OfficialConnectionRepository,
        private readonly redis: () => Redis | null,
    ) {}

    private key(phoneNumberId: string) { return `wab:conn:${phoneNumberId}`; }

    async find(phoneNumberId: string): Promise<Connection | null> {
        const redis = this.redis();
        const cached = await redis?.get(this.key(phoneNumberId)).catch(() => null);
        if (cached === 'none') return null;
        if (cached) {
            const conn = await this.repository.findById(Number(cached));
            if (conn) return conn;
        }
        const conn = await this.repository.findByPhoneNumberId(phoneNumberId);
        await redis?.set(this.key(phoneNumberId), conn ? String(conn.id) : 'none', 'EX', CachedConnectionLookup.TTL_SECONDS).catch(() => {});
        return conn;
    }

    /** Depois de criar/atualizar a conexão do número (o cache pode ter ficado "não existe"). */
    async forget(phoneNumberId: string): Promise<void> {
        await this.redis()?.del(this.key(phoneNumberId)).catch(() => {});
    }
}

export type StoredMessage = typeof atendimento_messages.$inferSelect;

export interface DeliveryFailure {
    connectionId: number;
    code: number | null;
    message: string;
    raw: unknown;
}

/** Mensagens do atendimento vistas pelo wamid da Meta. */
export interface CloudMessageStore {
    findByWamid(wamid: string): Promise<StoredMessage | null>;
    setWamid(messageId: number, wamid: string): Promise<void>;
    setAck(messageId: number, ack: number): Promise<void>;
    logDeliveryFailure(failure: DeliveryFailure): Promise<void>;
}

export class DrizzleCloudMessageStore implements CloudMessageStore {
    constructor(private readonly db: DB) {}

    async findByWamid(wamid: string) {
        const [row] = await this.db.select().from(atendimento_messages).where(eq(atendimento_messages.wab_message_id, wamid)).limit(1);
        return row ?? null;
    }

    async setWamid(messageId: number, wamid: string) {
        await this.db.update(atendimento_messages).set({ wab_message_id: wamid }).where(eq(atendimento_messages.id, messageId));
    }

    async setAck(messageId: number, ack: number) {
        await this.db.update(atendimento_messages).set({ ack }).where(eq(atendimento_messages.id, messageId));
    }

    async logDeliveryFailure(f: DeliveryFailure) {
        await this.db.insert(connection_errors_log).values({
            connection_id: f.connectionId,
            error_type: 'wab_message_failed',
            error_code: f.code,
            error_message: f.message,
            complete_error: JSON.stringify(f.raw),
        });
    }
}
