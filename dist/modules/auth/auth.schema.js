"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshTokens = exports.users = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const profile_db_schema_1 = require("../profiles/profile.db.schema");
const company_db_schema_1 = require("../companies/company.db.schema");
exports.users = (0, pg_core_1.pgTable)('users', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    name: (0, pg_core_1.varchar)('name', { length: 200 }).notNull(),
    nickname: (0, pg_core_1.varchar)('nickname', { length: 100 }),
    email: (0, pg_core_1.varchar)('email', { length: 200 }).notNull().unique(),
    password_hash: (0, pg_core_1.varchar)('password_hash', { length: 300 }).notNull(),
    profile_id: (0, pg_core_1.integer)('profile_id').notNull().references(() => profile_db_schema_1.profiles.id),
    company_id: (0, pg_core_1.uuid)('company_id').references(() => company_db_schema_1.companies.id, { onDelete: 'set null' }),
    email_verified: (0, pg_core_1.boolean)('email_verified').notNull().default(true),
    is_approved: (0, pg_core_1.boolean)('is_approved').notNull().default(false),
    finance: (0, pg_core_1.boolean)('finance').notNull().default(false),
    totp_secret: (0, pg_core_1.varchar)('totp_secret', { length: 64 }),
    totp_enabled: (0, pg_core_1.boolean)('totp_enabled').notNull().default(false),
    totp_recovery_codes: (0, pg_core_1.jsonb)('totp_recovery_codes'),
    // XP do mini-game de Conquistas: soma real (não calculada), incrementada
    // só quando o próprio usuário fecha um atendimento como venda.
    xp: (0, pg_core_1.integer)('xp').notNull().default(0),
    // Modo "permanente" de ocultar o nome no chat (config "Permitir ocultar
    // nome por tempo indeterminado"): true enquanto o atendente mantém o nome
    // oculto de propósito, até ele mesmo desligar — sobrevive a troca de
    // dispositivo/aba, ao contrário do modo temporário (2min, só client-side).
    hide_name_active: (0, pg_core_1.boolean)('hide_name_active').notNull().default(false),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
    updated_at: (0, pg_core_1.timestamp)('updated_at').defaultNow(),
});
exports.refreshTokens = (0, pg_core_1.pgTable)('refresh_tokens', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    user_id: (0, pg_core_1.uuid)('user_id').notNull().references(() => exports.users.id, { onDelete: 'cascade' }),
    token: (0, pg_core_1.text)('token').notNull().unique(),
    expires_at: (0, pg_core_1.timestamp)('expires_at').notNull(),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
});
//# sourceMappingURL=auth.schema.js.map