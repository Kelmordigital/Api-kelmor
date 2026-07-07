"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("./shared/server");
require("dotenv/config");
const env_1 = require("./config/env");
const migrate_1 = require("./database/migrate");
const socket_1 = require("./shared/socket");
const connection_health_job_1 = require("./jobs/connection-health.job");
const reconnection_queue_1 = require("./jobs/reconnection.queue");
const campanha_scheduler_1 = require("./modules/campanhas/campanha.scheduler");
const rabbitmq_1 = require("./shared/rabbitmq");
process.on('uncaughtException', (err) => {
    console.error('[uncaughtException] Erro não capturado — processo continuando:', err);
});
process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection] Promise rejeitada não tratada:', reason);
});
async function main() {
    await (0, migrate_1.runMigrations)();
    const app = (0, server_1.buildApp)();
    let healthInterval = null;
    let reconnectWorker = null;
    // Graceful shutdown: fecha conexões limpamente para evitar 401s pós-deploy
    async function shutdown(signal) {
        console.log(`[shutdown] Sinal ${signal} recebido — encerrando graciosamente...`);
        if (healthInterval)
            clearInterval(healthInterval);
        if (reconnectWorker)
            await reconnectWorker.close().catch(() => { });
        await (0, rabbitmq_1.stopRabbitConsumer)().catch(() => { });
        await app.close().catch(() => { });
        console.log('[shutdown] Servidor encerrado.');
        process.exit(0);
    }
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    try {
        await app.listen({ port: env_1.env.PORT, host: '0.0.0.0' });
        (0, socket_1.initSocket)(app.server);
        healthInterval = (0, connection_health_job_1.startConnectionHealthJob)();
        (0, connection_health_job_1.initSessionsGauge)().catch(() => { });
        reconnectWorker = (0, reconnection_queue_1.startReconnectionWorker)();
        (0, campanha_scheduler_1.restoreScheduledCampaigns)().catch(() => { });
        (0, rabbitmq_1.startRabbitConsumer)().catch((err) => console.error('[rabbitmq] start falhou:', err?.message));
        console.log(`Servidor rodando na porta ${env_1.env.PORT}`);
    }
    catch (err) {
        app.log.error(err);
        process.exit(1);
    }
}
main();
//# sourceMappingURL=main.js.map