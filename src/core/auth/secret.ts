import { createHash, timingSafeEqual } from 'crypto';

/**
 * Compara um segredo recebido com o esperado em tempo constante (não vaza,
 * pelo tempo de resposta, quantos caracteres batem). Os dois lados passam
 * por SHA-256 para terem o mesmo tamanho.
 */
export function secretsMatch(received: string | undefined, expected: string): boolean {
    if (received === undefined) return false;
    const digest = (value: string) => createHash('sha256').update(value).digest();
    return timingSafeEqual(digest(received), digest(expected));
}

/** Token de um cabeçalho `Authorization: Bearer <token>`. */
export function bearerToken(authorization: string | undefined): string | undefined {
    const match = /^Bearer (.+)$/.exec(authorization ?? '');
    return match?.[1];
}
