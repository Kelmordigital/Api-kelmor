"use strict";
/**
 * Gerador de BR Code PIX estático (padrão EMV®-QRCPS do Banco Central).
 * Não depende de integração externa: chave + nome + cidade (+ valor opcional)
 * produzem o payload "copia e cola" — o QR Code é a mesma string renderizada.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPixPayload = buildPixPayload;
function emv(id, value) {
    const len = String(value.length).padStart(2, '0');
    return `${id}${len}${value}`;
}
/** CRC16/CCITT-FALSE — obrigatório no campo 63 do BR Code. */
function crc16(payload) {
    let crc = 0xffff;
    for (let i = 0; i < payload.length; i++) {
        crc ^= payload.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) {
            crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
        }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
}
/** Remove acentos e limita tamanho — exigência dos campos de nome/cidade. */
function sanitize(text, maxLen) {
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9 .-]/g, '')
        .trim()
        .slice(0, maxLen);
}
function buildPixPayload(params) {
    const name = sanitize(params.merchantName || 'Recebedor', 25);
    const city = sanitize(params.merchantCity || 'BRASIL', 15);
    const merchantAccount = emv('26', emv('00', 'br.gov.bcb.pix') + emv('01', params.key.trim()));
    const amountNum = params.amount ? Number(params.amount) : NaN;
    const amountField = Number.isFinite(amountNum) && amountNum > 0
        ? emv('54', amountNum.toFixed(2))
        : '';
    let payload = emv('00', '01') + // Payload Format Indicator
        merchantAccount + // Merchant Account Info (PIX)
        emv('52', '0000') + // Merchant Category Code
        emv('53', '986') + // Moeda: BRL
        amountField + // Valor (opcional)
        emv('58', 'BR') + // País
        emv('59', name) + // Nome do recebedor
        emv('60', city) + // Cidade
        emv('62', emv('05', '***')) + // TXID livre
        '6304'; // CRC placeholder
    payload += crc16(payload);
    return payload;
}
//# sourceMappingURL=pix.util.js.map