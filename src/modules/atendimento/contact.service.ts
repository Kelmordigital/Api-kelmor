import { eq, and } from 'drizzle-orm';
import { db } from '../../database/client';
import { contacts, Contact } from './atendimento.db.schema';

export const contactService = {
    // lid = o ID numérico do @lid (ex: "205939420483821") para corrigir contatos criados antes do fix
    async findOrCreate(companyId: string, number: string, name?: string, lid?: string): Promise<Contact> {
        const clean = number.replace(/\D/g, '');

        // 1. Busca pelo número real
        const [byNumber] = await db
            .select()
            .from(contacts)
            .where(and(eq(contacts.company_id, companyId), eq(contacts.number, clean)))
            .limit(1);

        if (byNumber) return byNumber;

        // 2. Se veio de @lid, busca pelo número @lid armazenado errado e corrige
        if (lid) {
            const lidClean = lid.replace(/\D/g, '');
            const [byLid] = await db
                .select()
                .from(contacts)
                .where(and(eq(contacts.company_id, companyId), eq(contacts.number, lidClean)))
                .limit(1);

            if (byLid) {
                const [fixed] = await db
                    .update(contacts)
                    .set({ number: clean, lid: lidClean, name: name ?? byLid.name })
                    .where(eq(contacts.id, byLid.id))
                    .returning();
                console.log(`[contact] Número corrigido: ${lidClean} → ${clean} (id=${fixed.id})`);
                return fixed;
            }
        }

        // 3. Cria novo contato
        const [created] = await db
            .insert(contacts)
            .values({ company_id: companyId, name: name ?? clean, number: clean, lid: lid ? lid.replace(/\D/g, '') : null })
            .returning();

        return created;
    },

    async findById(id: number): Promise<Contact | null> {
        const [contact] = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
        return contact ?? null;
    },

    async list(companyId: string): Promise<Contact[]> {
        return db.select().from(contacts).where(eq(contacts.company_id, companyId));
    },
};
