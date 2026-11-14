import { NotFoundError } from '../../core/errors/http-errors';
import type { CompanyDirectory } from '../companies/company-directory';
import type { Etiqueta } from './etiqueta.db.schema';
import type { EtiquetaPatch, EtiquetaRepository } from './etiqueta.repository';
import type { CreateEtiquetaInput, UpdateEtiquetaInput } from './etiqueta.dto';
import { startOfDayBR, todayBR } from '../../core/dates/br-day';

const DEFAULT_COLOR = '#6366f1';
const DEFAULT_ICON = 'tag';
const STATS_DAYS = 7;

export interface EtiquetaStats {
    etiqueta_id: string;
    name: string;
    color: string;
    total_leads: number;
    series: { date: string; count: number }[];
}

/** Aplicar etiqueta num contato — o que o bot e as regras automáticas precisam (ISP). */
export interface ContactTagger {
    applyToContact(companyId: string, contactId: number, etiquetaId: string): Promise<void>;
}

export class EtiquetaService implements ContactTagger {
    constructor(
        private readonly repository: EtiquetaRepository,
        private readonly directory: CompanyDirectory,
        private readonly now: () => Date = () => new Date(),
    ) {}

    list(companyId: string): Promise<Etiqueta[]> {
        return this.repository.listByCompany(companyId);
    }

    create(companyId: string, input: CreateEtiquetaInput): Promise<Etiqueta> {
        return this.repository.create(companyId, {
            name:  input.name,
            color: input.color ?? DEFAULT_COLOR,
            icon:  input.icon ?? DEFAULT_ICON,
        });
    }

    async update(id: string, companyId: string, input: UpdateEtiquetaInput): Promise<Etiqueta> {
        const patch: EtiquetaPatch = {};
        if (input.name !== undefined) patch.name = input.name;
        if (input.color !== undefined) patch.color = input.color;
        if (input.icon !== undefined) patch.icon = input.icon;
        const row = await this.repository.update(id, companyId, patch);
        if (!row) throw EtiquetaService.tagNotFound();
        return row;
    }

    async remove(id: string, companyId: string): Promise<void> {
        if (!(await this.repository.delete(id, companyId))) throw EtiquetaService.tagNotFound();
    }

    /** Etiqueta e contato precisam ser da empresa. Aplicar de novo não duplica. */
    async applyToContact(companyId: string, contactId: number, etiquetaId: string): Promise<void> {
        if (!(await this.repository.findById(etiquetaId, companyId))) throw EtiquetaService.tagNotFound();
        if (!(await this.directory.hasContact(companyId, contactId))) throw new NotFoundError('Contato não encontrado');
        await this.repository.linkToContact(contactId, etiquetaId);
    }

    /** Sem efeito (e sem erro) se a etiqueta ou o contato não forem da empresa. */
    async removeFromContact(companyId: string, contactId: number, etiquetaId: string): Promise<void> {
        const [ownsContact, tag] = await Promise.all([
            this.directory.hasContact(companyId, contactId),
            this.repository.findById(etiquetaId, companyId),
        ]);
        if (ownsContact && tag) await this.repository.unlinkFromContact(contactId, etiquetaId);
    }

    /** Contato de outra empresa responde lista vazia (não revela que existe). */
    async listForContact(companyId: string, contactId: number): Promise<Etiqueta[]> {
        if (!(await this.directory.hasContact(companyId, contactId))) return [];
        return this.repository.listForContact(contactId, companyId);
    }

    /** Total de contatos por etiqueta e aplicações por dia nos últimos 7 dias (hoje incluso, horário de Brasília). */
    async getStats(companyId: string): Promise<EtiquetaStats[]> {
        const tags = await this.repository.listByCompany(companyId);
        const days = this.lastDays();
        const usage = await this.repository.usage(tags.map((t) => t.id), startOfDayBR(days[0]));

        return tags.map((tag) => ({
            etiqueta_id: tag.id,
            name: tag.name,
            color: tag.color,
            total_leads: usage.totals.get(tag.id) ?? 0,
            series: days.map((date) => ({ date, count: usage.daily.get(tag.id)?.get(date) ?? 0 })),
        }));
    }

    private lastDays(): string[] {
        const today = new Date(`${todayBR(this.now())}T00:00:00.000Z`); // só a data de hoje em Brasília
        return Array.from({ length: STATS_DAYS }, (_, i) => {
            const d = new Date(today);
            d.setUTCDate(d.getUTCDate() - (STATS_DAYS - 1 - i));
            return d.toISOString().slice(0, 10);
        });
    }

    private static tagNotFound() {
        return new NotFoundError('Etiqueta não encontrada');
    }
}
