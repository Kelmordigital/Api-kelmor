import type { CompanyDeactivationHandler } from '../companies/company-status';
import type { CampaignsGateway } from './campaigns.gateway';

interface CampaignState {
    id: number;
    is_running?: boolean;
    is_sending?: boolean;
    is_paused?: boolean;
}

/** Agendada ou disparando, e ainda não pausada. */
function isActive(c: CampaignState): boolean {
    return !c.is_paused && Boolean(c.is_running || c.is_sending);
}

/**
 * Empresa desativada não dispara campanhas: as ativas são pausadas (como no
 * botão "pausar"). Reativar a empresa não as retoma — o admin decide.
 */
export class ActiveCampaignsPauser implements CompanyDeactivationHandler {
    readonly name = 'pausar campanhas';

    constructor(private readonly gateway: CampaignsGateway) {}

    async onDeactivated(companyId: string): Promise<void> {
        const list = await this.gateway.list(companyId);
        const active = (Array.isArray(list) ? list as CampaignState[] : []).filter(isActive);
        for (const campaign of active) await this.gateway.pause(campaign.id, companyId);
    }
}
