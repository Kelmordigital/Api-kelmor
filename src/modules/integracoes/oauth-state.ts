import { signOAuthStateTicket, verifyOAuthStateTicket } from '../../config/jwt';

/**
 * O `state` do OAuth carrega a empresa que iniciou a conexão. Ele é assinado
 * e expira, para ninguém montar uma URL com o id de outra empresa e
 * sequestrar a integração dela no callback.
 */
export interface OAuthStateSigner {
    sign(companyId: string): string;
    /** Empresa do state, ou null se ele for inválido/expirado. */
    verify(state: string): string | null;
}

export class JwtOAuthStateSigner implements OAuthStateSigner {
    sign(companyId: string): string {
        return signOAuthStateTicket(companyId);
    }

    verify(state: string): string | null {
        return verifyOAuthStateTicket(state)?.companyId ?? null;
    }
}
