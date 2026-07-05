"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleCampaign = scheduleCampaign;
exports.cancelCampaignTask = cancelCampaignTask;
exports.resumeCampaign = resumeCampaign;
exports.restoreScheduledCampaigns = restoreScheduledCampaigns;
const node_cron_1 = __importDefault(require("node-cron"));
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../database/client");
const campanha_db_schema_1 = require("./campanha.db.schema");
const atendimento_db_schema_1 = require("../atendimento/atendimento.db.schema");
const activeTasks = new Map();
async function scheduleCampaign(campaignId) {
    cancelCampaignTask(campaignId);
    const [campaign] = await client_1.db.select().from(campanha_db_schema_1.campaigns).where((0, drizzle_orm_1.eq)(campanha_db_schema_1.campaigns.id, campaignId));
    if (!campaign)
        return;
    const sendDate = new Date(campaign.send_date);
    const now = new Date();
    if (sendDate <= now) {
        setImmediate(() => executeCampaign(campaignId));
        return;
    }
    // Build cron expression from UTC components
    const m = sendDate.getUTCMinutes();
    const h = sendDate.getUTCHours();
    const d = sendDate.getUTCDate();
    const mo = sendDate.getUTCMonth() + 1;
    const cronExpr = `${m} ${h} ${d} ${mo} *`;
    const task = node_cron_1.default.schedule(cronExpr, async () => {
        task.stop();
        activeTasks.delete(campaignId);
        await executeCampaign(campaignId);
    });
    activeTasks.set(campaignId, task);
    await client_1.db.update(campanha_db_schema_1.campaigns)
        .set({ is_running: true, updated_at: new Date() })
        .where((0, drizzle_orm_1.eq)(campanha_db_schema_1.campaigns.id, campaignId));
}
function cancelCampaignTask(campaignId) {
    const task = activeTasks.get(campaignId);
    if (task) {
        task.stop();
        activeTasks.delete(campaignId);
    }
}
async function resumeCampaign(campaignId) {
    const [campaign] = await client_1.db.select().from(campanha_db_schema_1.campaigns).where((0, drizzle_orm_1.eq)(campanha_db_schema_1.campaigns.id, campaignId));
    if (!campaign)
        return;
    const sendDate = new Date(campaign.send_date);
    if (sendDate > new Date()) {
        await scheduleCampaign(campaignId);
    }
    else {
        setImmediate(() => executeCampaign(campaignId));
    }
}
async function restoreScheduledCampaigns() {
    try {
        const running = await client_1.db.select().from(campanha_db_schema_1.campaigns)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(campanha_db_schema_1.campaigns.is_running, true), (0, drizzle_orm_1.eq)(campanha_db_schema_1.campaigns.is_paused, false), (0, drizzle_orm_1.eq)(campanha_db_schema_1.campaigns.is_sending, false)));
        for (const campaign of running) {
            const sendDate = new Date(campaign.send_date);
            if (sendDate > new Date()) {
                await scheduleCampaign(campaign.id);
                console.log(`[CampaignScheduler] Restored #${campaign.id} → ${sendDate.toISOString()}`);
            }
            else {
                setImmediate(() => executeCampaign(campaign.id));
            }
        }
    }
    catch (err) {
        console.error('[CampaignScheduler] Restore error:', err.message);
    }
}
async function executeCampaign(campaignId) {
    const [campaign] = await client_1.db.select().from(campanha_db_schema_1.campaigns).where((0, drizzle_orm_1.eq)(campanha_db_schema_1.campaigns.id, campaignId));
    if (!campaign || campaign.is_paused)
        return;
    await client_1.db.update(campanha_db_schema_1.campaigns)
        .set({ is_running: true, is_sending: true, updated_at: new Date() })
        .where((0, drizzle_orm_1.eq)(campanha_db_schema_1.campaigns.id, campaignId));
    try {
        const connLinks = await client_1.db.select({ connection_id: campanha_db_schema_1.campaignConnections.connection_id })
            .from(campanha_db_schema_1.campaignConnections)
            .where((0, drizzle_orm_1.eq)(campanha_db_schema_1.campaignConnections.campaign_id, campaignId));
        if (connLinks.length === 0) {
            console.warn(`[Campaign #${campaignId}] No connections configured`);
            await finishCampaign(campaignId);
            return;
        }
        const connectionId = connLinks[0].connection_id;
        // Resolve contacts
        let targets = [];
        if (campaign.all_contacts) {
            targets = await client_1.db.select({ id: atendimento_db_schema_1.contacts.id, number: atendimento_db_schema_1.contacts.number })
                .from(atendimento_db_schema_1.contacts)
                .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.company_id, campaign.company_id));
        }
        else {
            const contactLinks = await client_1.db.select({ contact_id: campanha_db_schema_1.campaignContacts.contact_id })
                .from(campanha_db_schema_1.campaignContacts)
                .where((0, drizzle_orm_1.eq)(campanha_db_schema_1.campaignContacts.campaign_id, campaignId));
            if (contactLinks.length > 0) {
                targets = await client_1.db.select({ id: atendimento_db_schema_1.contacts.id, number: atendimento_db_schema_1.contacts.number })
                    .from(atendimento_db_schema_1.contacts)
                    .where((0, drizzle_orm_1.inArray)(atendimento_db_schema_1.contacts.id, contactLinks.map(c => c.contact_id)));
            }
        }
        // Skip already-sent contacts (supports resume after pause)
        const alreadySent = await client_1.db.select({ contact_id: campanha_db_schema_1.campaignSent.contact_id })
            .from(campanha_db_schema_1.campaignSent)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(campanha_db_schema_1.campaignSent.campaign_id, campaignId), (0, drizzle_orm_1.eq)(campanha_db_schema_1.campaignSent.is_sent, true)));
        const sentIds = new Set(alreadySent.map(s => s.contact_id));
        const toSend = targets.filter(c => c.number && !sentIds.has(c.id));
        const { whatsappService } = await Promise.resolve().then(() => __importStar(require('../whatsapp/whatsapp.service')));
        for (const contact of toSend) {
            const [current] = await client_1.db.select({ is_paused: campanha_db_schema_1.campaigns.is_paused })
                .from(campanha_db_schema_1.campaigns).where((0, drizzle_orm_1.eq)(campanha_db_schema_1.campaigns.id, campaignId));
            if (current?.is_paused)
                break;
            try {
                await whatsappService.sendTextToPhone(connectionId, contact.number, campaign.message);
                await client_1.db.insert(campanha_db_schema_1.campaignSent).values({
                    campaign_id: campaignId,
                    contact_id: contact.id,
                    number: contact.number,
                    is_sent: true,
                    sent_at: new Date(),
                });
                await client_1.db.update(campanha_db_schema_1.campaigns)
                    .set({ send_contacts: (0, drizzle_orm_1.sql) `${campanha_db_schema_1.campaigns.send_contacts} + 1`, updated_at: new Date() })
                    .where((0, drizzle_orm_1.eq)(campanha_db_schema_1.campaigns.id, campaignId));
                // Delay between sends to avoid rate limiting
                await new Promise(r => setTimeout(r, 1500));
            }
            catch (err) {
                await client_1.db.insert(campanha_db_schema_1.campaignSent).values({
                    campaign_id: campaignId,
                    contact_id: contact.id,
                    number: contact.number,
                    is_sent: false,
                    sent_at: new Date(),
                    error: String(err.message ?? err).slice(0, 500),
                });
            }
        }
        await finishCampaign(campaignId);
    }
    catch (err) {
        console.error(`[Campaign #${campaignId}] Fatal error:`, err.message);
        await client_1.db.update(campanha_db_schema_1.campaigns)
            .set({ is_running: false, is_sending: false, updated_at: new Date() })
            .where((0, drizzle_orm_1.eq)(campanha_db_schema_1.campaigns.id, campaignId));
    }
}
async function finishCampaign(campaignId) {
    await client_1.db.update(campanha_db_schema_1.campaigns)
        .set({ is_running: false, is_sending: false, updated_at: new Date() })
        .where((0, drizzle_orm_1.eq)(campanha_db_schema_1.campaigns.id, campaignId));
    console.log(`[Campaign #${campaignId}] Completed`);
}
//# sourceMappingURL=campanha.scheduler.js.map