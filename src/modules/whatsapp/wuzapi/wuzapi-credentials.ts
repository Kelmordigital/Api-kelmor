import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Credenciais de cada conexão na WuzAPI, derivadas de um segredo único
 * (WUZAPI_SECRET) + o id da conexão. Assim não há token a guardar no banco:
 * a API sempre consegue recalcular o token do "usuário" WuzAPI e a chave que
 * assina os webhooks dele.
 */
export class WuzapiCredentials {
    constructor(private readonly secret: string) {
        if (!secret || secret.length < 32) throw new Error('WUZAPI_SECRET ausente ou curto (mínimo 32 caracteres)');
    }

    /** Nome do usuário na WuzAPI. Um usuário WuzAPI = uma conexão (número). */
    userName(connectionId: number): string {
        return `conn-${connectionId}`;
    }

    /** Token de usuário (header `Token`) da conexão. */
    token(connectionId: number): string {
        return this.derive(`token:${connectionId}`).slice(0, 40);
    }

    /** Chave HMAC com que a WuzAPI assina os webhooks da conexão (≥ 32 caracteres). */
    hmacKey(connectionId: number): string {
        return this.derive(`hmac:${connectionId}`);
    }

    /** Confere o `x-hmac-signature` (hex do HMAC-SHA256 do corpo cru). */
    isValidSignature(connectionId: number, rawBody: string, signature: string | undefined): boolean {
        if (!signature) return false;
        const expected = createHmac('sha256', this.hmacKey(connectionId)).update(rawBody).digest('hex');
        const a = Buffer.from(expected, 'utf8');
        const b = Buffer.from(signature.trim().toLowerCase(), 'utf8');
        return a.length === b.length && timingSafeEqual(a, b);
    }

    private derive(label: string): string {
        return createHmac('sha256', this.secret).update(label).digest('hex');
    }
}
