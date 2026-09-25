export declare const campanhaService: {
    list(companyId: string): Promise<unknown>;
    create(companyId: string, payload: {
        title: string;
        message: string;
        type?: string;
        send_date: string;
        timezone?: string;
        all_contacts?: boolean;
        connection_ids: number[];
        contact_ids?: number[];
    }): Promise<unknown>;
    update(id: number, companyId: string, payload: {
        title?: string;
        message?: string;
        send_date?: string;
        timezone?: string;
        all_contacts?: boolean;
        connection_ids?: number[];
        contact_ids?: number[];
    }): Promise<{
        id: number;
    }>;
    remove(id: number, companyId: string): Promise<boolean>;
    play(id: number, companyId: string): Promise<boolean>;
    pause(id: number, companyId: string): Promise<boolean>;
    getSelects(companyId: string): Promise<{
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
    }>;
    listTexts(companyId: string): Promise<{
        id: number;
        company_id: string;
        label: string;
        text: string | null;
        type: number;
    }[]>;
    upsertText(companyId: string, payload: {
        label: string;
        text?: string;
        type: number;
    }): Promise<{
        type: number;
        id: number;
        company_id: string;
        label: string;
        text: string | null;
    }>;
    updateText(id: number, companyId: string, payload: {
        label: string;
        text?: string;
    }): Promise<{
        id: number;
        company_id: string;
        label: string;
        text: string | null;
        type: number;
    }>;
    removeText(id: number, companyId: string): Promise<boolean>;
};
//# sourceMappingURL=campanha.service.d.ts.map