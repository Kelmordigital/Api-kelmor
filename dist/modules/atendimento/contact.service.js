"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.contactService = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../database/client");
const atendimento_db_schema_1 = require("./atendimento.db.schema");
exports.contactService = {
    // lid = o ID numérico do @lid (ex: "205939420483821") para corrigir contatos criados antes do fix
    async findOrCreate(companyId, number, name, lid) {
        const clean = number.replace(/\D/g, '');
        // 1. Busca pelo número real
        const [byNumber] = await client_1.db
            .select()
            .from(atendimento_db_schema_1.contacts)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.company_id, companyId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.number, clean)))
            .limit(1);
        if (byNumber)
            return byNumber;
        // 2. Se veio de @lid, busca pelo número @lid armazenado errado e corrige
        if (lid) {
            const lidClean = lid.replace(/\D/g, '');
            const [byLid] = await client_1.db
                .select()
                .from(atendimento_db_schema_1.contacts)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.company_id, companyId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.number, lidClean)))
                .limit(1);
            if (byLid) {
                const [fixed] = await client_1.db
                    .update(atendimento_db_schema_1.contacts)
                    .set({ number: clean, lid: lidClean, name: name ?? byLid.name })
                    .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.id, byLid.id))
                    .returning();
                console.log(`[contact] Número corrigido: ${lidClean} → ${clean} (id=${fixed.id})`);
                return fixed;
            }
        }
        // 3. Cria novo contato
        const [created] = await client_1.db
            .insert(atendimento_db_schema_1.contacts)
            .values({ company_id: companyId, name: name ?? clean, number: clean, lid: lid ? lid.replace(/\D/g, '') : null })
            .returning();
        return created;
    },
    async findById(id) {
        const [contact] = await client_1.db.select().from(atendimento_db_schema_1.contacts).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.id, id)).limit(1);
        return contact ?? null;
    },
    async list(companyId) {
        return client_1.db.select().from(atendimento_db_schema_1.contacts).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.company_id, companyId));
    },
};
//# sourceMappingURL=contact.service.js.map