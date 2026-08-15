"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendDropConnectionEmail = sendDropConnectionEmail;
const resend_1 = require("resend");
const env_1 = require("../../config/env");
let client = null;
function getClient() {
    if (!env_1.env.RESEND_API_KEY)
        return null;
    if (!client)
        client = new resend_1.Resend(env_1.env.RESEND_API_KEY);
    return client;
}
const CODE_LABELS = {
    401: 'sessão desconectada pelo WhatsApp (logout)',
    403: 'acesso bloqueado pelo WhatsApp',
    408: 'timeout de rede',
    411: 'credenciais inválidas (multidevice)',
    428: 'reinício de protocolo solicitado',
    440: 'outro dispositivo conectou nessa sessão',
    500: 'sessão corrompida',
    503: 'servidores do WhatsApp instáveis',
};
async function sendDropConnectionEmail(params) {
    const resend = getClient();
    if (!resend) {
        console.warn('[resend] RESEND_API_KEY não configurada — alerta de queda de conexão não enviado');
        return;
    }
    if (params.to.length === 0)
        return;
    const motivo = params.code
        ? (CODE_LABELS[params.code] ?? `código ${params.code}`)
        : (params.reason ?? 'motivo não identificado');
    try {
        await resend.emails.send({
            from: `${env_1.env.RESEND_FROM_NAME} <${env_1.env.RESEND_FROM_EMAIL}>`,
            to: params.to,
            subject: `⚠️ Conexão WhatsApp "${params.connectionName}" caiu`,
            html: `
                <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                    <h2 style="color: #dc2626;">Conexão WhatsApp desconectada</h2>
                    <p>A conexão <strong>${params.connectionName}</strong> da empresa <strong>${params.companyName}</strong> caiu e parou de enviar/receber mensagens.</p>
                    <p><strong>Motivo:</strong> ${motivo}</p>
                    <p>Acesse o painel e reconecte o WhatsApp escaneando o QR code novamente.</p>
                </div>
            `,
        });
    }
    catch (error) {
        console.error('[resend] Falha ao enviar alerta de queda de conexão:', error);
    }
}
//# sourceMappingURL=resend.service.js.map