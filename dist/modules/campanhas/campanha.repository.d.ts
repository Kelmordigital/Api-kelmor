import type { DB } from '../../database/client';
import { scheduledMessageTexts } from './campanha.db.schema';
export type ScheduledText = typeof scheduledMessageTexts.$inferSelect;
export interface CampaignOptions {
    connections: {
        id: number;
        name: string;
        status: string | null;
    }[];
    contacts: {
        id: number;
        name: string;
        number: string | null;
    }[];
}
export interface ScheduledTextData {
    label: string;
    text: string | null;
    type: number;
}
/** Dados locais do módulo: opções do formulário e textos de agendamento. */
export interface CampanhaRepository {
    options(companyId: string): Promise<CampaignOptions>;
    listTexts(companyId: string): Promise<ScheduledText[]>;
    /** Maior posição (type) usada pela empresa; 0 se não houver textos. */
    lastTextPosition(companyId: string): Promise<number>;
    insertTexts(companyId: string, texts: ScheduledTextData[]): Promise<ScheduledText[]>;
    updateText(id: number, companyId: string, data: {
        label: string;
        text: string | null;
    }): Promise<ScheduledText | null>;
    deleteText(id: number, companyId: string): Promise<boolean>;
}
export declare class DrizzleCampanhaRepository implements CampanhaRepository {
    private readonly db;
    constructor(db: DB);
    options(companyId: string): Promise<CampaignOptions>;
    listTexts(companyId: string): Promise<ScheduledText[]>;
    lastTextPosition(companyId: string): Promise<number>;
    insertTexts(companyId: string, texts: ScheduledTextData[]): Promise<ScheduledText[]>;
    updateText(id: number, companyId: string, data: {
        label: string;
        text: string | null;
    }): Promise<ScheduledText | null>;
    deleteText(id: number, companyId: string): Promise<boolean>;
}
//# sourceMappingURL=campanha.repository.d.ts.map