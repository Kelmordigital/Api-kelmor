import { Agendamento, NewAgendamento } from './agenda.db.schema';
export declare const agendaService: {
    list(companyId: string, start: Date, end: Date): Promise<Agendamento[]>;
    create(companyId: string, userId: string, payload: Omit<NewAgendamento, "id" | "company_id" | "created_by" | "google_event_id" | "created_at" | "updated_at">): Promise<Agendamento>;
    update(id: string, companyId: string, payload: Partial<Pick<Agendamento, "title" | "lead_id" | "start_at" | "end_at" | "color" | "notes" | "notify_on_create" | "reminder_minutes" | "remind_at_exact" | "notify_groups">>): Promise<Agendamento | null>;
    remove(id: string, companyId: string): Promise<boolean>;
};
//# sourceMappingURL=agenda.service.d.ts.map