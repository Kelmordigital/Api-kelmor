"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpCampaignsGateway = void 0;
const http_errors_1 = require("../../core/errors/http-errors");
class HttpCampaignsGateway {
    config;
    constructor(config) {
        this.config = config;
    }
    list(companyId) {
        return this.request('GET', `/campaign?company_id=${companyId}`);
    }
    create(companyId, payload) {
        return this.request('POST', '/campaign', { ...payload, company_id: companyId });
    }
    async update(id, companyId, payload) {
        await this.request('PUT', `/campaign/${id}`, { company_id: companyId, ...payload });
    }
    async delete(id, companyId) {
        await this.request('DELETE', `/campaign/${id}?company_id=${companyId}`);
    }
    async play(id, companyId) {
        await this.request('POST', `/campaign/${id}/play?company_id=${companyId}`);
    }
    async pause(id, companyId) {
        await this.request('POST', `/campaign/${id}/pause?company_id=${companyId}`);
    }
    async request(method, path, body) {
        let res;
        try {
            res = await fetch(`${this.config.baseUrl}${path}`, {
                method,
                headers: { 'Content-Type': 'application/json', 'x-internal-secret': this.config.internalSecret },
                body: body ? JSON.stringify(body) : undefined,
                signal: AbortSignal.timeout(this.config.timeoutMs ?? 10_000),
            });
        }
        catch (err) {
            console.error(`[campanhas] Microsserviço não respondeu (${method} ${path}):`, err instanceof Error ? err.message : err);
            throw HttpCampaignsGateway.unavailable();
        }
        const data = await res.json().catch(() => null);
        if (res.ok)
            return data;
        if (res.status === 404)
            throw new http_errors_1.NotFoundError('Campanha não encontrada');
        if (res.status === 400)
            throw new http_errors_1.BadRequestError(data?.message ?? 'Dados da campanha inválidos');
        console.error(`[campanhas] Microsserviço respondeu ${res.status} (${method} ${path}):`, data?.message);
        throw HttpCampaignsGateway.unavailable();
    }
    static unavailable() {
        return new http_errors_1.BadGatewayError('Serviço de campanhas indisponível. Tente novamente.');
    }
}
exports.HttpCampaignsGateway = HttpCampaignsGateway;
//# sourceMappingURL=campaigns.gateway.js.map