"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userAvatars = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const auth_schema_1 = require("../auth/auth.schema");
exports.userAvatars = (0, pg_core_1.pgTable)('at_user_avatars', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    user_id: (0, pg_core_1.uuid)('user_id').notNull().unique().references(() => auth_schema_1.users.id, { onDelete: 'cascade' }),
    url: (0, pg_core_1.varchar)('url', { length: 500 }).notNull(),
    original_name: (0, pg_core_1.varchar)('original_name', { length: 255 }),
    mime_type: (0, pg_core_1.varchar)('mime_type', { length: 100 }),
    size_bytes: (0, pg_core_1.integer)('size_bytes'),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
    updated_at: (0, pg_core_1.timestamp)('updated_at').defaultNow(),
});
//# sourceMappingURL=meu-perfil.db.schema.js.map