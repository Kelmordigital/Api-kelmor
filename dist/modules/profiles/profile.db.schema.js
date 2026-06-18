"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.profiles = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
exports.profiles = (0, pg_core_1.pgTable)('profiles', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    name: (0, pg_core_1.varchar)('name', { length: 100 }).notNull(),
    tag: (0, pg_core_1.varchar)('tag', { length: 50 }).notNull().unique(),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
});
//# sourceMappingURL=profile.db.schema.js.map