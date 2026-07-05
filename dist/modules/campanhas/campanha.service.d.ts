export declare const campanhaService: {
    list(companyId: string): Promise<{
        connection_ids: number[];
        contact_ids: number[];
        sent_count: number;
        failed_count: number;
        id: number;
        company_id: string;
        title: string;
        message: string;
        type: string;
        send_date: Date;
        timezone: string;
        all_contacts: boolean;
        tags: string | null;
        is_running: boolean;
        is_sending: boolean;
        is_paused: boolean;
        send_contacts: number;
        created_at: Date | null;
        updated_at: Date | null;
    }[]>;
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
    create(companyId: string, payload: {
        title: string;
        message: string;
        type?: string;
        send_date: string;
        timezone?: string;
        all_contacts?: boolean;
        connection_ids: number[];
        contact_ids?: number[];
    }): Promise<{
        type: string;
        message: string;
        id: number;
        created_at: Date | null;
        updated_at: Date | null;
        company_id: string;
        timezone: string;
        title: string;
        send_date: Date;
        all_contacts: boolean;
        tags: string | null;
        is_running: boolean;
        is_sending: boolean;
        is_paused: boolean;
        send_contacts: number;
    }>;
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