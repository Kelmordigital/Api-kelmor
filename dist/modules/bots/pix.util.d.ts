/**
 * Gerador de BR Code PIX estático (padrão EMV®-QRCPS do Banco Central).
 * Não depende de integração externa: chave + nome + cidade (+ valor opcional)
 * produzem o payload "copia e cola" — o QR Code é a mesma string renderizada.
 */
export declare function buildPixPayload(params: {
    key: string;
    merchantName: string;
    merchantCity: string;
    amount?: string | null;
}): string;
//# sourceMappingURL=pix.util.d.ts.map