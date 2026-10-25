import { BadGatewayError, BadRequestError, NotFoundError } from '../../core/errors/http-errors';

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

export class HttpCampaignsGateway implements CampaignsGateway {
    constructor(private readonly config: HttpCampaignsConfig) {}

    list(companyId: string): Promise<unknown> {
        return this.request('GET', `/campaign?company_id=${companyId}`);
    }

    create(companyId: string, payload: CampaignPayload): Promise<unknown> {
        return this.request('POST', '/campaign', { ...payload, company_id: companyId });
    }

    async update(id: number, companyId: string, payload: CampaignPayload): Promise<void> {
        await this.request('PUT', `/campaign/${id}`, { company_id: companyId, ...payload });
    }

    async delete(id: number, companyId: string): Promise<void> {
        await this.request('DELETE', `/campaign/${id}?company_id=${companyId}`);
    }

    async play(id: number, companyId: string): Promise<void> {
        await this.request('POST', `/campaign/${id}/play?company_id=${companyId}`);
    }

    async pause(id: number, companyId: string): Promise<void> {
        await this.request('POST', `/campaign/${id}/pause?company_id=${companyId}`);
    }

    private async request(method: string, path: string, body?: object): Promise<unknown> {
        let res: Response;
        try {
            res = await fetch(`${this.config.baseUrl}${path}`, {
                method,
                headers: { 'Content-Type': 'application/json', 'x-internal-secret': this.config.internalSecret },
                body: body ? JSON.stringify(body) : undefined,
                signal: AbortSignal.timeout(this.config.timeoutMs ?? 10_000),
            });
        } catch (err) {
            console.error(`[campanhas] Microsserviço não respondeu (${method} ${path}):`, err instanceof Error ? err.message : err);
            throw HttpCampaignsGateway.unavailable();
        }

        const data = await res.json().catch(() => null) as { message?: string } | null;
        if (res.ok) return data;
        if (res.status === 404) throw new NotFoundError('Campanha não encontrada');
        if (res.status === 400) throw new BadRequestError(data?.message ?? 'Dados da campanha inválidos');

        console.error(`[campanhas] Microsserviço respondeu ${res.status} (${method} ${path}):`, data?.message);
        throw HttpCampaignsGateway.unavailable();
    }

    private static unavailable() {
        return new BadGatewayError('Serviço de campanhas indisponível. Tente novamente.');
    }
}
