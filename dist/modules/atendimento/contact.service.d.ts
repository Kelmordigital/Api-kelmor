import { Contact } from './atendimento.db.schema';
export declare const contactService: {
    findOrCreate(companyId: string, number: string, name?: string, lid?: string): Promise<Contact>;
    findById(id: number): Promise<Contact | null>;
    list(companyId: string): Promise<Contact[]>;
};
//# sourceMappingURL=contact.service.d.ts.map