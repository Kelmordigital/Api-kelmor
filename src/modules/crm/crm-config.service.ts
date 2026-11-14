import { NotFoundError } from '../../core/errors/http-errors';
import type { CrmConfigRepository, OriginKeyword } from './crm.repository';
import type { CreateKeywordInput, CreateReasonInput, UpdateReasonInput } from './crm.dto';

/** RN-CRM-03: a primeira palavra-chave contida na mensagem (sem diferenciar maiúsculas) dá a origem. */
export function originOf(keywords: OriginKeyword[], message: string): string | null {
    const text = message.toLowerCase();
    return keywords.find((k) => text.includes(k.keyword.toLowerCase()))?.origin ?? null;
}

/** Motivos de não venda e palavras-chave de origem (tela de configuração do CRM). */
export class CrmConfigService {
    constructor(private readonly repository: CrmConfigRepository) {}

    listReasons(companyId: string) {
        return this.repository.listReasons(companyId);
    }

    createReason(companyId: string, input: CreateReasonInput) {
        return this.repository.createReason(companyId, input);
    }

    async updateReason(id: number, companyId: string, input: UpdateReasonInput) {
        const row = await this.repository.updateReason(id, companyId, input);
        if (!row) throw new NotFoundError('Não encontrado');
        return row;
    }

    deleteReason(id: number, companyId: string) {
        return this.repository.deleteReason(id, companyId);
    }

    listKeywords(companyId: string) {
        return this.repository.listKeywords(companyId);
    }

    createKeyword(companyId: string, input: CreateKeywordInput) {
        return this.repository.createKeyword(companyId, input);
    }

    deleteKeyword(id: number, companyId: string) {
        return this.repository.deleteKeyword(id, companyId);
    }

    /** Origem do lead pela primeira mensagem (usado ao abrir um ticket novo). */
    async matchOrigin(companyId: string, message: string): Promise<string | null> {
        return originOf(await this.repository.listKeywords(companyId), message);
    }
}

/**
 * Atalho usado pelo webhook do WhatsApp ao abrir um ticket novo. Import tardio:
 * o módulo do CRM depende do atendimento.
 */
export async function matchKeywordOrigin(companyId: string, messageText: string): Promise<string | null> {
    const { crmConfigService } = await import('./crm.module');
    return crmConfigService.matchOrigin(companyId, messageText);
}
