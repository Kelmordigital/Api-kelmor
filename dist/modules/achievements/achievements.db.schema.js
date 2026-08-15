"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userAchievementProgress = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const company_db_schema_1 = require("../companies/company.db.schema");
// Progresso do Mapa de Conquistas: 1 linha por missão concluída por usuário.
// O catálogo das missões (título, ícone, tela-alvo) vive em código no frontend —
// aqui só se grava o que já foi concluído.
exports.userAchievementProgress = (0, pg_core_1.pgTable)('at_user_achievement_progress', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    company_id: (0, pg_core_1.uuid)('company_id').notNull().references(() => company_db_schema_1.companies.id, { onDelete: 'cascade' }),
    user_id: (0, pg_core_1.uuid)('user_id').notNull(),
    mission_key: (0, pg_core_1.varchar)('mission_key', { length: 100 }).notNull(),
    completed_at: (0, pg_core_1.timestamp)('completed_at').defaultNow(),
}, (table) => ({
    userMissionUnique: (0, pg_core_1.unique)().on(table.user_id, table.mission_key),
}));
//# sourceMappingURL=achievements.db.schema.js.map