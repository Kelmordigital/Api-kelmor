import { buildApp } from './shared/server';
import 'dotenv/config';

import { env } from './config/env';
import { runMigrations } from './database/migrate';
import { initSocket } from './shared/socket';
import { startConnectionHealthJob, initSessionsGauge } from './jobs/connection-health.job';
import { startReconnectionWorker } from './jobs/reconnection.queue';
import { scheduledMessageLoop } from './modules/agendamento-mensagens/agendamento-mensagens.module';
import { AutoCloseLoop, TicketAutoCloser } from './modules/atendimento/ticket-auto-close';
import { ticketService } from './modules/atendimento/ticket.service';
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
    // Fecha tickets parados conforme "Fechar tickets abertos/pendentes após (h)" (seguro com várias réplicas)
    const autoCloseLoop = new AutoCloseLoop(new TicketAutoCloser(
        (ticket, companyId, sendGoodbye, userId) => ticketService._sendClosingMessage(ticket, companyId, sendGoodbye, userId),
    ));

    // Graceful shutdown: fecha conexões limpamente para evitar 401s pós-deploy
    async function shutdown(signal: string) {
        console.log(`[shutdown] Sinal ${signal} recebido — encerrando graciosamente...`);
        if (healthInterval) clearInterval(healthInterval);
        scheduledMessageLoop.stop();
        autoCloseLoop.stop();
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
        initSessionsGauge().catch(() => {});
        reconnectWorker   = startReconnectionWorker();
        // Envia as mensagens agendadas que vencerem (seguro com várias réplicas)
        scheduledMessageLoop.start();
        autoCloseLoop.start();
        startRabbitConsumer().catch((err) => console.error('[rabbitmq] start falhou:', err?.message));
        console.log(`Servidor rodando na porta ${env.PORT}`);
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
}

main();
