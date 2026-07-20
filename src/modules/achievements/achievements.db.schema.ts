import {
    pgTable, uuid, varchar, timestamp, unique,
} from 'drizzle-orm/pg-core';
import { companies } from '../companies/company.db.schema';

// Progresso do Mapa de Conquistas: 1 linha por missão concluída por usuário.
// O catálogo das missões (título, ícone, tela-alvo) vive em código no frontend —
// aqui só se grava o que já foi concluído.
export const userAchievementProgress = pgTable('at_user_achievement_progress', {
    id:           uuid('id').primaryKey().defaultRandom(),
    company_id:   uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    user_id:      uuid('user_id').notNull(),
    mission_key:  varchar('mission_key', { length: 100 }).notNull(),
    completed_at: timestamp('completed_at').defaultNow(),
}, (table) => ({
    userMissionUnique: unique().on(table.user_id, table.mission_key),
}));

export type UserAchievementProgress    = typeof userAchievementProgress.$inferSelect;
export type NewUserAchievementProgress = typeof userAchievementProgress.$inferInsert;
