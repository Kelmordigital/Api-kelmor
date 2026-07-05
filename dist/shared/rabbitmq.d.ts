export declare function startRabbitConsumer(): Promise<void>;
/**
 * Converte o envelope `messagingPayload` do bays para o formato cru do Baileys
 * que o handleMessagesWebhook consome (`{ data: { key, message, pushName, ... } }`).
 * Se o corpo já vier no formato cru (`{ data }`), passa direto.
 */
export declare function toWebhookBody(body: any): {
    connectionId: number;
    webhook: unknown;
};
export declare function stopRabbitConsumer(): Promise<void>;
//# sourceMappingURL=rabbitmq.d.ts.map