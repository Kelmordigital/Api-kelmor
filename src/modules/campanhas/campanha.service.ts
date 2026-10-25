import { BadRequestError, NotFoundError } from '../../core/errors/http-errors';
import type { CompanyResourceFilter } from '../companies/company-directory';
import type { CampaignPayload, CampaignsGateway } from './campaigns.gateway';
import type { CampaignOptions, CampanhaRepository, ScheduledText } from './campanha.repository';
import type { CreateCampaignInput, UpdateCampaignInput, TextInput } from './campanha.dto';

/**
 * Campanhas de disparo: validadas e escopadas pela empresa aqui, executadas
 * pelo microsserviço `campaigns`. Conexões e contatos de outra empresa nunca
 * são repassados (defesa em profundidade: o microsserviço também confere).
 */
export class CampaignService {
    constructor(
        private readonly gateway: CampaignsGateway,
        private readonly resources: CompanyResourceFilter,
        private readonly repository: CampanhaRepository,
    ) {}

    list(companyId: string): Promise<unknown> {
        return this.gateway.list(companyId);
    }

    options(companyId: string): Promise<CampaignOptions> {
        return this.repository.options(companyId);
    }

    async create(companyId: string, input: CreateCampaignInput): Promise<unknown> {
        const payload = await this.scoped(companyId, input);
        if (!payload.connection_ids?.length) throw new BadRequestError('Selecione ao menos uma conexão');
        return this.gateway.create(companyId, payload);
    }

    async update(id: number, companyId: string, input: UpdateCampaignInput): Promise<void> {
        await this.gateway.update(id, companyId, await this.scoped(companyId, input));
    }

    delete(id: number, companyId: string): Promise<void> {
        return this.gateway.delete(id, companyId);
    }

    play(id: number, companyId: string): Promise<void> {
        return this.gateway.play(id, companyId);
    }

    pause(id: number, companyId: string): Promise<void> {
        return this.gateway.pause(id, companyId);
    }

    /** Só campos conhecidos, com conexões/contatos filtrados para os da empresa. */
    private async scoped(companyId: string, input: UpdateCampaignInput): Promise<CampaignPayload> {
        const { connection_ids, contact_ids, ...fields } = input;
        const payload: CampaignPayload = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
        if (connection_ids !== undefined) payload.connection_ids = await this.resources.ownedConnectionIds(companyId, connection_ids);
        if (contact_ids !== undefined) payload.contact_ids = await this.resources.ownedContactIds(companyId, contact_ids);
        return payload;
    }
}

/**
 * Textos prontos de agendamento da empresa, oferecidos ao atendente no modal
 * "Agendar mensagem" do atendimento. Cada empresa cadastra os seus; a ordem
 * de exibição é a de criação.
 */
export class ScheduledTextService {
    constructor(private readonly repository: CampanhaRepository) {}

    list(companyId: string): Promise<ScheduledText[]> {
        return this.repository.listTexts(companyId);
    }

    async create(companyId: string, input: TextInput): Promise<ScheduledText> {
        const position = (await this.repository.lastTextPosition(companyId)) + 1;
        const [created] = await this.repository.insertTexts(companyId, [{ label: input.label, text: input.text ?? null, type: position }]);
        return created;
    }

    async update(id: number, companyId: string, input: TextInput): Promise<ScheduledText> {
        const row = await this.repository.updateText(id, companyId, { label: input.label, text: input.text ?? null });
        if (!row) throw ScheduledTextService.notFound();
        return row;
    }

    async remove(id: number, companyId: string): Promise<void> {
        if (!(await this.repository.deleteText(id, companyId))) throw ScheduledTextService.notFound();
    }

    private static notFound() {
        return new NotFoundError('Texto não encontrado');
    }
}
