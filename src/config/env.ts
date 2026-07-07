import { config } from 'dotenv';
config();


import { z } from 'zod';

const envSchema = z.object({
    // Servidor
    PORT: z.string().default('3000').transform(Number),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    // Banco de dados
    DATABASE_URL: z.string().url('DATABASE_URL inválida'),
    TEST_DATABASE_URL: z.string().url('TEST_DATABASE_URL inválida').optional(),


    JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter ao menos 32 caracteres'),
    JWT_EXPIRES_IN: z.string().default('15m'),
    REFRESH_SECRET: z.string().min(32, 'REFRESH_SECRET deve ter ao menos 32 caracteres'),
    REFRESH_EXPIRES_IN: z.string().default('7d'),


    FRONTEND_URL: z.string().url().default('http://localhost:5173'),
    SUPERADMIN_URL: z.string().url().default('http://localhost:8081'),

    EVOLUTION_API_URL: z.string().url().optional(),
    EVOLUTION_API_KEY: z.string().optional(),
    EVOLUTION_INSTANCE: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),

    FILIPE_INSTANCE: z.string().optional(),
    FILIPE_PHONE: z.string().optional(),
    REDIS_URL: z.string().optional(),

    // Bays (Baileys WhatsApp service)
    BAYS_URL: z.string().url().default('http://localhost:4001'),
    BAYS_SECRET_KEY: z.string().default(''),
    BAYS_SESSION_ID: z.string().default('1'),

    // API Oficial do WhatsApp (Cloud API / Meta)
    META_GRAPH_API_VERSION: z.string().default('v21.0'),
    WAB_APP_ID: z.string().default(''),                  // app da Meta (Embedded Signup / OAuth)
    WAB_APP_SECRET: z.string().default(''),              // secret do app (troca do code OAuth)
    WAB_USER_TOKEN: z.string().default(''),              // token do System User → wab_token das conexões
    WAB_WEBHOOK_VERIFY_TOKEN: z.string().default('kelmor'), // hub.verify_token do webhook

    ADMIN_SECRET: z.string().min(16, 'ADMIN_SECRET deve ter ao menos 16 caracteres'),
    WEBHOOK_SECRET: z.string().min(16, 'WEBHOOK_SECRET deve ter ao menos 16 caracteres'),
    API_URL: z.string().url().default('http://localhost:3000'),
    INTERNAL_API_SECRET: z.string().min(16, 'INTERNAL_API_SECRET deve ter ao menos 16 caracteres').default('kelmor_internal_api_secret_32chars00'),

    GOOGLE_CLIENT_ID:     z.string().default(''),
    GOOGLE_CLIENT_SECRET: z.string().default(''),
    GOOGLE_REDIRECT_URI:  z.string().default('http://localhost:3000/api/v1/integracoes/google/callback'),

    // RabbitMQ (barramento de eventos com o bays). Desligado por padrão →
    // recebimento por HTTP webhook (fallback garantido).
    USE_RABBITMQ:   z.string().default('false').transform((v) => v === 'true'),
    RABBITMQ_URL:   z.string().default('kelmor-rabbitmq'),
    RABBITMQ_PORT1: z.string().default('5672').transform(Number),
    RABBITMQ_USER:  z.string().default('kelmor'),
    RABBITMQ_PASS:  z.string().default('kelmor123'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    console.error('❌ Variáveis de ambiente inválidas:');
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
}

export const env = parsed.data;