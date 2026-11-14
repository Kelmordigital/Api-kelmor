import { secretsMatch, bearerToken } from '../../core/auth/secret';

export interface MetricsAccessSettings {
    /** Token que o coletor (Alloy) manda em `Authorization: Bearer`. */
    token?: string;
    production: boolean;
}

export type MetricsAccessDecision = 'allow' | 'unauthorized' | 'hidden';

/**
 * RN-MON-06: quem pode ler o /metrics. Com token configurado, só quem o
 * envia. Sem token, só fora de produção — em produção a rota "não existe"
 * (a API fica atrás de um ingress que publica todos os caminhos).
 */
export class MetricsAccess {
    constructor(private readonly settings: () => MetricsAccessSettings) {}

    decide(authorization: string | undefined): MetricsAccessDecision {
        const { token, production } = this.settings();
        if (token) return secretsMatch(bearerToken(authorization), token) ? 'allow' : 'unauthorized';
        return production ? 'hidden' : 'allow';
    }
}
