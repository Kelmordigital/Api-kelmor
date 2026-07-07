import { pgTable, uuid, varchar, text, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { companies } from '../companies/company.db.schema';

export const etiquetas = pgTable('at_etiquetas', {
    id:              uuid('id').primaryKey().defaultRandom(),
    company_id:      uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    name:            varchar('name', { length: 100 }).notNull(),
    color:           varchar('color', { length: 20 }).notNull().default('#6366f1'),
    icon:            varchar('icon', { length: 50 }).notNull().default('tag'),
    keyword_trigger: text('keyword_trigger'),
    keyword_type:    varchar('keyword_type', { length: 20 }).notNull().default('contains'),
    created_at:      timestamp('created_at').defaultNow(),
    updated_at:      timestamp('updated_at').defaultNow(),
});

// contact_id é varchar para aceitar tanto UUIDs de leads (uso original)
// quanto ids numéricos de at_contacts (nó "Adicionar Tag" do bot).
export const contactEtiquetas = pgTable('at_contact_etiquetas', {
    contact_id:  varchar('contact_id', { length: 64 }).notNull(),
    etiqueta_id: uuid('etiqueta_id').notNull().references(() => etiquetas.id, { onDelete: 'cascade' }),
    created_at:  timestamp('created_at').defaultNow(),
}, (t) => ({
    pk: primaryKey({ columns: [t.contact_id, t.etiqueta_id] }),
}));

export type Etiqueta    = typeof etiquetas.$inferSelect;
export type NewEtiqueta = typeof etiquetas.$inferInsert;
