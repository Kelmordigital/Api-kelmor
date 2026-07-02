import { buildApp } from './shared/server';
import 'dotenv/config';

import { env } from './config/env';
import { runMigrations } from './database/migrate';
import { initSocket } from './shared/socket';
import { startConnectionHealthJob } from './jobs/connection-health.job';
import { startReconnectionWorker } from './jobs/reconnection.queue';
import { restoreScheduledCampaigns } from './modules/campanhas/campanha.scheduler';
import { startRabbitConsumer, stopRabbitConsumer } from './shared/rabbitmq';
import type { Worker } from 'bullmq';

process.on('uncaughtException', (err) => {
    console.error('[uncaughtException] Erro não capturado — processo continuando:', err);
});

process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection] Promise rejeitada não tratada:', reason);
});

async function main() {
    await runMigrations();

    const app = buildApp();

    let healthInterval: NodeJS.Timeout | null = null;
    let reconnectWorker: Worker | null = null;

    // Graceful shutdown: fecha conexões limpamente para evitar 401s pós-deploy
    async function shutdown(signal: string) {
        console.log(`[shutdown] Sinal ${signal} recebido — encerrando graciosamente...`);
        if (healthInterval) clearInterval(healthInterval);
        if (reconnectWorker) await reconnectWorker.close().catch(() => {});
        await stopRabbitConsumer().catch(() => {});
        await app.close().catch(() => {});
        console.log('[shutdown] Servidor encerrado.');
        process.exit(0);
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));

    try {
        await app.listen({ port: env.PORT, host: '0.0.0.0' });
        initSocket(app.server);
        healthInterval    = startConnectionHealthJob();
        reconnectWorker   = startReconnectionWorker();
        restoreScheduledCampaigns().catch(() => {});
        startRabbitConsumer().catch((err) => console.error('[rabbitmq] start falhou:', err?.message));
        console.log(`Servidor rodando na porta ${env.PORT}`);
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
}

main();
