import type { CompanyResourceFilter } from '../companies/company-directory';
import type { CampaignsGateway } from './campaigns.gateway';
import type { CampaignOptions, CampanhaRepository, ScheduledText } from './campanha.repository';
import type { CreateCampaignInput, UpdateCampaignInput, TextInput } from './campanha.dto';
/**
 * Campanhas de disparo: validadas e escopadas pela empresa aqui, executadas
 * pelo microsserviço `campaigns`. Conexões e contatos de outra empresa nunca
 * são repassados (defesa em profundidade: o microsserviço também confere).
 */
export declare class CampaignService {
    private readonly gateway;
    private readonly resources;
    private readonly repository;
    constructor(gateway: CampaignsGateway, resources: CompanyResourceFilter, repository: CampanhaRepository);
    list(companyId: string): Promise<unknown>;
    options(companyId: string): Promise<CampaignOptions>;
    create(companyId: string, input: CreateCampaignInput): Promise<unknown>;
    update(id: number, companyId: string, input: UpdateCampaignInput): Promise<void>;
    delete(id: number, companyId: string): Promise<void>;
    play(id: number, companyId: string): Promise<void>;
    pause(id: number, companyId: string): Promise<void>;
    /** Só campos conhecidos, com conexões/contatos filtrados para os da empresa. */
    private scoped;
}
/**
 * Textos prontos de agendamento da empresa, oferecidos ao atendente no modal
 * "Agendar mensagem" do atendimento. Cada empresa cadastra os seus; a ordem
 * de exibição é a de criação.
 */
export declare class ScheduledTextService {
    private readonly repository;
    constructor(repository: CampanhaRepository);
    list(companyId: string): Promise<ScheduledText[]>;
    create(companyId: string, input: TextInput): Promise<ScheduledText>;
    update(id: number, companyId: string, input: TextInput): Promise<ScheduledText>;
    remove(id: number, companyId: string): Promise<void>;
    private static notFound;
}
//# sourceMappingURL=campanha.service.d.ts.map