import { CompanyIntegration } from './integracao.db.schema';
export declare const integracaoService: {
    handleCallback(companyId: string, code: string): Promise<void>;
    getStatus(companyId: string): Promise<{
        connected: boolean;
        email?: string;
    }>;
    disconnect(companyId: string): Promise<void>;
    getValidTokens(companyId: string): Promise<CompanyIntegration | null>;
};
//# sourceMappingURL=integracao.service.d.ts.map