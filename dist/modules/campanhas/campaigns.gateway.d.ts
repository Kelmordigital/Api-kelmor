/** Campos de campanha como o microsserviço `campaigns` espera. */
export interface CampaignPayload {
    title?: string;
    message?: string;
    type?: string;
    send_date?: string;
    timezone?: string;
    all_contacts?: boolean;
    connection_ids?: number[];
    contact_ids?: number[];
}
/**
 * O microsserviço `campaigns` persiste, agenda e dispara as campanhas.
 * Toda chamada leva a empresa. Erros viram AppError: 404 (não existe ou é
 * de outra empresa), 400 (dados recusados) e 502 (serviço com falha).
 */
export interface CampaignsGateway {
    list(companyId: string): Promise<unknown>;
    create(companyId: string, payload: CampaignPayload): Promise<unknown>;
    update(id: number, companyId: string, payload: CampaignPayload): Promise<void>;
    delete(id: number, companyId: string): Promise<void>;
    play(id: number, companyId: string): Promise<void>;
    pause(id: number, companyId: string): Promise<void>;
}
export interface HttpCampaignsConfig {
    baseUrl: string;
    internalSecret: string;
    timeoutMs?: number;
}
export declare class HttpCampaignsGateway implements CampaignsGateway {
    private readonly config;
    constructor(config: HttpCampaignsConfig);
    list(companyId: string): Promise<unknown>;
    create(companyId: string, payload: CampaignPayload): Promise<unknown>;
    update(id: number, companyId: string, payload: CampaignPayload): Promise<void>;
    delete(id: number, companyId: string): Promise<void>;
    play(id: number, companyId: string): Promise<void>;
    pause(id: number, companyId: string): Promise<void>;
    private request;
    private static unavailable;
}
//# sourceMappingURL=campaigns.gateway.d.ts.map