import { env } from '../../config/env';
import { getRedisClient } from '../../config/redis';
import { mediaStorage } from '../../config/media-storage';
import { db } from '../../database/client';
import { emitToCompany } from '../../shared/socket';
import { GraphApiClient } from './graph-api.client';
import { CachedConnectionLookup, DrizzleCloudMessageStore, DrizzleOfficialConnections } from './whatsapp-oficial.repository';
import { CloudApiSender, OfficialConnections, OfficialOnboarding, OfficialTemplates } from './whatsapp-oficial.service';
import { CloudWebhookService } from './whatsapp-oficial-webhook.service';
import { AtendimentoInbox, CloudMediaStore, RedisDeduplicator } from './inbound-adapters';
import { CloudWebhookController, WhatsappOficialController } from './whatsapp-oficial.controller';
import { CloudWebhookRouter, WhatsappOficialRouter } from './whatsapp-oficial.routes';

/** Composição do módulo: único lugar que escolhe as implementações concretas. */
const graph = new GraphApiClient(() => env.META_GRAPH_API_VERSION);
const connectionRepository = new DrizzleOfficialConnections(db);
const lookup = new CachedConnectionLookup(connectionRepository, getRedisClient);
const sender = new CloudApiSender(graph);

const onboarding = new OfficialOnboarding(graph, connectionRepository, lookup, () => ({
    appId: env.WAB_APP_ID, appSecret: env.WAB_APP_SECRET, systemUserToken: env.WAB_USER_TOKEN,
}));

const webhook = new CloudWebhookService(
    lookup,
    new DrizzleCloudMessageStore(db),
    new AtendimentoInbox(emitToCompany),
    new CloudMediaStore(graph, mediaStorage),
    new RedisDeduplicator(getRedisClient),
    emitToCompany,
    () => ({ verifyToken: env.WAB_WEBHOOK_VERIFY_TOKEN, appSecret: env.WAB_APP_SECRET }),
);

export const whatsappOficialRouter = new WhatsappOficialRouter(
    new WhatsappOficialController(onboarding, new OfficialConnections(connectionRepository), new OfficialTemplates(graph, sender)),
);
export const cloudWebhookRouter = new CloudWebhookRouter(new CloudWebhookController(webhook));

/** Envio pela Cloud API (usado pelo `whatsappOficialService` de compatibilidade). */
export const cloudApiSender = sender;
