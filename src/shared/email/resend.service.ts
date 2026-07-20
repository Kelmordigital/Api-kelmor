import { Resend } from 'resend';
import { env } from '../../config/env';

let client: Resend | null = null;

function getClient(): Resend | null {
    if (!env.RESEND_API_KEY) return null;
    if (!client) client = new Resend(env.RESEND_API_KEY);
    return client;
}

interface DropConnectionEmailParams {
    to: string[];
    connectionName: string;
    companyName: string;
    code?: number;
    reason?: string;
}

const CODE_LABELS: Record<number, string> = {
    401: 'sessão desconectada pelo WhatsApp (logout)',
    403: 'acesso bloqueado pelo WhatsApp',
    408: 'timeout de rede',
    411: 'credenciais inválidas (multidevice)',
    428: 'reinício de protocolo solicitado',
    440: 'outro dispositivo conectou nessa sessão',
    500: 'sessão corrompida',
    503: 'servidores do WhatsApp instáveis',
};

export async function sendDropConnectionEmail(params: DropConnectionEmailParams): Promise<void> {
    const resend = getClient();
    if (!resend) {
        console.warn('[resend] RESEND_API_KEY não configurada — alerta de queda de conexão não enviado');
        return;
    }
    if (params.to.length === 0) return;

    const motivo = params.code
        ? (CODE_LABELS[params.code] ?? `código ${params.code}`)
        : (params.reason ?? 'motivo não identificado');

    try {
        await resend.emails.send({
            from: `${env.RESEND_FROM_NAME} <${env.RESEND_FROM_EMAIL}>`,
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
    } catch (error) {
        console.error('[resend] Falha ao enviar alerta de queda de conexão:', error);
    }
}
