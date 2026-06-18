"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMigrations = runMigrations;
const postgres_js_1 = require("drizzle-orm/postgres-js");
const migrator_1 = require("drizzle-orm/postgres-js/migrator");
const postgres_1 = __importDefault(require("postgres"));
const env_1 = require("../config/env");
async function ensureEtiquetasTables(client) {
    await client.unsafe(`
        CREATE TABLE IF NOT EXISTS "etiquetas" (
            "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
            "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
            "name" text NOT NULL,
            "color" text NOT NULL DEFAULT '#6366f1',
            "icon" text NOT NULL DEFAULT 'tag',
            "keyword_trigger" text,
            "keyword_type" text NOT NULL DEFAULT 'contains',
            "created_at" timestamp DEFAULT now(),
            "updated_at" timestamp DEFAULT now()
        )
    `);
    await client.unsafe(`
        CREATE TABLE IF NOT EXISTS "lead_etiquetas" (
            "lead_id" uuid NOT NULL REFERENCES "leads"("id") ON DELETE CASCADE,
            "etiqueta_id" uuid NOT NULL REFERENCES "etiquetas"("id") ON DELETE CASCADE,
            "created_at" timestamp DEFAULT now(),
            CONSTRAINT "lead_etiquetas_pk" PRIMARY KEY ("lead_id", "etiqueta_id")
        )
    `);
    console.log('[migrate] Tabelas etiquetas e lead_etiquetas garantidas.');
}
async function runMigrations() {
    const client = (0, postgres_1.default)(env_1.env.DATABASE_URL, { max: 1 });
    const db = (0, postgres_js_1.drizzle)(client);
    console.log('[migrate] Verificando migrations pendentes...');
    await (0, migrator_1.migrate)(db, { migrationsFolder: 'drizzle' });
    console.log('[migrate] Banco de dados atualizado.');
    await ensureEtiquetasTables(client);
    await ensureMetasTable(client);
    await client.end();
}
async function ensureMetasTable(client) {
    await client.unsafe(`
        CREATE TABLE IF NOT EXISTS "metas" (
            "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
            "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
            "tipo" text NOT NULL,
            "valor_alvo" integer NOT NULL,
            "data_inicio" date NOT NULL,
            "data_fim" date NOT NULL,
            "created_at" timestamp DEFAULT now(),
            "updated_at" timestamp DEFAULT now()
        )
    `);
    console.log('[migrate] Tabela metas garantida.');
}
//# sourceMappingURL=migrate.js.map