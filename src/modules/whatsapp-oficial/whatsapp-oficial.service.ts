import { ConflictError, NotFoundError, UnprocessableEntityError } from '../../core/errors/http-errors';
import type { Connection } from '../atendimento/atendimento.db.schema';
import { GraphApiError, type GraphApiClient } from './graph-api.client';
import { buildMediaPayload, buildTemplatePayload, buildTextPayload, type CloudMediaType } from './cloud-api.payloads';
import type { CachedConnectionLookup, OfficialConnectionRepository } from './whatsapp-oficial.repository';
import type { CreateConnectionInput, CreateTemplateInput } from './whatsapp-oficial.dto';

/** Recusa da Meta (ou dado que falta para falar com ela) → 422 com a mensagem. */
async function metaCall<T>(call: () => Promise<T>): Promise<T> {
    try {
        return await call();
    } catch (err) {
        if (err instanceof GraphApiError || err instanceof MetaSetupError) throw new UnprocessableEntityError(err.message);
        throw err;
    }
}

/** Conexão sem os dados que a Meta exige (token, WABA, telefone). */
export class MetaSetupError extends Error {}

/** RN-WAB-04: envio pela Cloud API (POST /<phone_number_id>/messages). Devolve o wamid. */
export class CloudApiSender {
    constructor(private readonly graph: GraphApiClient) {}

    async sendPayload(conn: Connection, payload: Record<string, unknown>): Promise<string | undefined> {
        if (!conn.wab_business_phonenumber_id || !conn.wab_token) {
            throw new MetaSetupError(`Conexão ${conn.id} sem wab_business_phonenumber_id/wab_token`);
        }
        const data = await this.graph.post<{ messages?: { id: string }[] }>(`/${conn.wab_business_phonenumber_id}/messages`, conn.wab_token, payload);
        return data?.messages?.[0]?.id;
    }

    sendText(conn: Connection, to: string, text: string, replyToWamid?: string): Promise<string | undefined> {
        if (!text?.trim()) throw new Error('Mensagem vazia');
        return this.sendPayload(conn, buildTextPayload(to, text, replyToWamid));
    }

    sendMedia(conn: Connection, to: string, mediaType: CloudMediaType, link: string, opts: { caption?: string; filename?: string } = {}) {
        return this.sendPayload(conn, buildMediaPayload(to, mediaType, link, opts));
    }

    sendTemplate(conn: Connection, to: string, name: string, languageCode = 'pt_BR', components?: unknown[]) {
        return this.sendPayload(conn, buildTemplatePayload(to, name, languageCode, components));
    }
}

/** RN-WAB-01: conexões oficiais da empresa. */
export class OfficialConnections {
    constructor(private readonly repository: OfficialConnectionRepository) {}

    /** A conexão oficial da empresa; de outra empresa ou de outro tipo = não encontrada. */
    async owned(companyId: string, connectionId: number): Promise<Connection> {
        const conn = await this.repository.findById(connectionId);
        if (!conn || conn.company_id !== companyId || conn.type !== 'whatsapp-oficial') {
            throw new NotFoundError('Conexão oficial não encontrada');
        }
        return conn;
    }
}

export interface MetaAppSettings {
    appId: string;
    appSecret: string;
    /** Token do System User da Kelmor (usado quando o cliente não envia o dele). */
    systemUserToken: string;
}

/** PIN da verificação em duas etapas definido ao registrar o número (ver pontos em aberto). */
const REGISTRATION_PIN = '123456';

/** RN-WAB-02 e 03: criação da conexão oficial (Embedded Signup ou credenciais manuais). */
export class OfficialOnboarding {
    constructor(
        private readonly graph: GraphApiClient,
        private readonly repository: OfficialConnectionRepository,
        private readonly lookup: CachedConnectionLookup,
        private readonly settings: () => MetaAppSettings,
        private readonly log: (message: string) => void = (m) => console.error(m),
    ) {}

    async connect(companyId: string, input: CreateConnectionInput): Promise<Connection> {
        return metaCall(async () => {
            const { wabaId, phoneNumberId } = input.code
                ? await this.wabaFromOAuth(input.code)
                : { wabaId: input.wabaId!, phoneNumberId: input.phoneNumberId! };

            const token = input.token || this.settings().systemUserToken;
            if (!token) throw new MetaSetupError('Sem token da Meta: configure WAB_USER_TOKEN ou envie token');

            // Um número só pode estar numa empresa; na mesma empresa, reconectar atualiza.
            const existing = await this.repository.findByPhoneNumberId(phoneNumberId);
            if (existing && existing.company_id !== companyId) throw new ConflictError('Este número já está conectado em outra empresa');

            const registered = await this.register(phoneNumberId, token);
            const phone = await this.phoneInfo(phoneNumberId, token);
            const values = {
                company_id: companyId,
                name: input.name || phone?.verified_name || 'WhatsApp Business',
                type: 'whatsapp-oficial' as const,
                status: 'connected' as const,
                wab_connection: true as const,
                wab_business_id: wabaId,
                wab_business_phonenumber_id: phoneNumberId,
                wab_business_number: phone?.display_phone_number ?? null,
                wab_token: token,
                wab_is_registered: registered,
            };
            const conn = existing ? await this.repository.update(existing.id, values) : await this.repository.create(values);
            await this.lookup.forget(phoneNumberId);
            return conn;
        });
    }

    /** Embedded Signup: code → token do usuário → WABA (escopos do token) → primeiro telefone do WABA. */
    private async wabaFromOAuth(code: string): Promise<{ wabaId: string; phoneNumberId: string }> {
        const { appId, appSecret } = this.settings();
        const userToken = await this.graph.exchangeCode(appId, appSecret, code);
        const debug = await this.graph.get<{ data?: { granular_scopes?: { scope: string; target_ids?: string[] }[] } }>(
            `/debug_token?input_token=${userToken}`, userToken,
        );
        const wabaId = debug?.data?.granular_scopes?.find((s) => s.scope === 'whatsapp_business_management')?.target_ids?.[0];
        if (!wabaId) throw new MetaSetupError('WABA não encontrado nos escopos do token');
        const phones = await this.graph.get<{ data?: { id: string }[] }>(`/${wabaId}/phone_numbers`, userToken);
        const phoneNumberId = phones?.data?.[0]?.id;
        if (!phoneNumberId) throw new MetaSetupError('Nenhum telefone encontrado no WABA');
        return { wabaId, phoneNumberId };
    }

    /** Registra o número na Cloud API; já registrado não é erro. Falha no registro não impede a conexão. */
    private async register(phoneNumberId: string, token: string): Promise<boolean> {
        try {
            const info = await this.graph.get<{ platform_type?: string }>(`/${phoneNumberId}?fields=platform_type`, token);
            if (info?.platform_type === 'CLOUD_API') return true;
        } catch { /* segue para o registro */ }
        try {
            const res = await this.graph.post<{ success?: boolean }>(`/${phoneNumberId}/register`, token, { messaging_product: 'whatsapp', pin: REGISTRATION_PIN });
            return res?.success === true;
        } catch (err) {
            this.log(`[WAB] Falha ao registrar número ${phoneNumberId}: ${(err as Error).message}`);
            return false;
        }
    }

    private async phoneInfo(phoneNumberId: string, token: string) {
        try {
            return await this.graph.get<{ display_phone_number?: string; verified_name?: string }>(`/${phoneNumberId}?fields=display_phone_number,verified_name`, token);
        } catch {
            return null;
        }
    }
}

/** RN-WAB-05 e 06: templates de mensagem da conta (WABA) da conexão. */
export class OfficialTemplates {
    constructor(private readonly graph: GraphApiClient, private readonly sender: CloudApiSender) {}

    list(conn: Connection): Promise<unknown[]> {
        return metaCall(async () => {
            if (!conn.wab_business_id || !conn.wab_token) return [];
            const res = await this.graph.get<{ data?: unknown[] }>(`/${conn.wab_business_id}/message_templates?limit=100`, conn.wab_token);
            return res?.data ?? [];
        });
    }

    create(conn: Connection, template: CreateTemplateInput): Promise<unknown> {
        return metaCall(() => {
            const { wabaId, token } = OfficialTemplates.account(conn);
            return this.graph.post(`/${wabaId}/message_templates`, token, template);
        });
    }

    remove(conn: Connection, name: string): Promise<void> {
        return metaCall(async () => {
            const { wabaId, token } = OfficialTemplates.account(conn);
            await this.graph.delete(`/${wabaId}/message_templates?name=${encodeURIComponent(name)}`, token);
        });
    }

    /** Fora da janela de 24 h, só template aprovado chega ao cliente. */
    send(conn: Connection, to: string, name: string, language: string, components?: unknown[]): Promise<string | undefined> {
        return metaCall(() => this.sender.sendTemplate(conn, to, name, language, components));
    }

    private static account(conn: Connection): { wabaId: string; token: string } {
        if (!conn.wab_business_id || !conn.wab_token) throw new MetaSetupError('Conexão sem wab_business_id/wab_token');
        return { wabaId: conn.wab_business_id, token: conn.wab_token };
    }
}

/**
 * Compatibilidade: o `whatsapp.service` importa `whatsappOficialService.sendText`
 * deste arquivo. Importação tardia do módulo (a composição fica lá).
 */
export const whatsappOficialService = {
    async sendText(conn: Connection, to: string, text: string, replyToWamid?: string): Promise<string | undefined> {
        const { cloudApiSender } = await import('./whatsapp-oficial.module');
        return cloudApiSender.sendText(conn, to, text, replyToWamid);
    },
};
