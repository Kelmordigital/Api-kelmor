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
exports.scheduleMessageTask = scheduleMessageTask;
exports.cancelMessageTask = cancelMessageTask;
exports.restoreScheduledMessages = restoreScheduledMessages;
const node_cron_1 = __importDefault(require("node-cron"));
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../database/client");
const agendamento_mensagens_db_schema_1 = require("./agendamento-mensagens.db.schema");
const atendimento_db_schema_1 = require("../atendimento/atendimento.db.schema");
const activeTasks = new Map();
/** Agenda o disparo (one-shot) de uma mensagem já gravada no banco. */
async function scheduleMessageTask(id) {
    cancelMessageTask(id);
    const [row] = await client_1.db.select().from(agendamento_mensagens_db_schema_1.scheduledMessages).where((0, drizzle_orm_1.eq)(agendamento_mensagens_db_schema_1.scheduledMessages.id, id));
    if (!row || row.status !== 'scheduled')
        return;
    const sendDate = new Date(row.send_date);
    const now = new Date();
    if (sendDate <= now) {
        setImmediate(() => executeScheduledMessage(id));
        return;
    }
    const m = sendDate.getUTCMinutes();
    const h = sendDate.getUTCHours();
    const d = sendDate.getUTCDate();
    const mo = sendDate.getUTCMonth() + 1;
    const cronExpr = `${m} ${h} ${d} ${mo} *`;
    // Os campos acima vêm de getUTC*() — o node-cron precisa saber que são UTC,
    // senão interpreta no fuso local do servidor (ex.: America/Sao_Paulo, UTC-3),
    // disparando a mensagem 3h mais tarde do que o agendado.
    const task = node_cron_1.default.schedule(cronExpr, async () => {
        task.stop();
        activeTasks.delete(id);
        await executeScheduledMessage(id);
    }, { timezone: 'UTC' });
    activeTasks.set(id, task);
}
function cancelMessageTask(id) {
    const task = activeTasks.get(id);
    if (task) {
        task.stop();
        activeTasks.delete(id);
    }
}
/** Chamado no boot: recria em memória os agendamentos pendentes (o job em memória se perde a cada restart). */
async function restoreScheduledMessages() {
    try {
        const pending = await client_1.db.select().from(agendamento_mensagens_db_schema_1.scheduledMessages)
            .where((0, drizzle_orm_1.eq)(agendamento_mensagens_db_schema_1.scheduledMessages.status, 'scheduled'));
        for (const row of pending) {
            const sendDate = new Date(row.send_date);
            if (sendDate > new Date()) {
                await scheduleMessageTask(row.id);
                console.log(`[ScheduledMessage] Restored #${row.id} → ${sendDate.toISOString()}`);
            }
            else {
                setImmediate(() => executeScheduledMessage(row.id));
            }
        }
    }
    catch (err) {
        console.error('[ScheduledMessage] Restore error:', err.message);
    }
}
async function executeScheduledMessage(id) {
    const [row] = await client_1.db.select().from(agendamento_mensagens_db_schema_1.scheduledMessages).where((0, drizzle_orm_1.eq)(agendamento_mensagens_db_schema_1.scheduledMessages.id, id));
    if (!row || row.status !== 'scheduled')
        return;
    try {
        const [contact] = await client_1.db.select({ number: atendimento_db_schema_1.contacts.number, lid: atendimento_db_schema_1.contacts.lid })
            .from(atendimento_db_schema_1.contacts).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.id, row.contact_id));
        const target = contact?.number || (contact?.lid ? `lid:${contact.lid}` : null);
        if (!target) {
            await client_1.db.update(agendamento_mensagens_db_schema_1.scheduledMessages)
                .set({ status: 'failed', last_error: 'Contato sem número/LID', updated_at: new Date() })
                .where((0, drizzle_orm_1.eq)(agendamento_mensagens_db_schema_1.scheduledMessages.id, id));
            return;
        }
        const { whatsappService } = await Promise.resolve().then(() => __importStar(require('../whatsapp/whatsapp.service')));
        await whatsappService.sendTextToPhone(row.connection_id, target, row.message);
        await client_1.db.update(agendamento_mensagens_db_schema_1.scheduledMessages)
            .set({ status: 'sent', sent_at: new Date(), updated_at: new Date() })
            .where((0, drizzle_orm_1.eq)(agendamento_mensagens_db_schema_1.scheduledMessages.id, id));
    }
    catch (err) {
        await client_1.db.update(agendamento_mensagens_db_schema_1.scheduledMessages)
            .set({ status: 'failed', last_error: String(err.message ?? err).slice(0, 500), updated_at: new Date() })
            .where((0, drizzle_orm_1.eq)(agendamento_mensagens_db_schema_1.scheduledMessages.id, id));
    }
}
//# sourceMappingURL=agendamento-mensagens.scheduler.js.map