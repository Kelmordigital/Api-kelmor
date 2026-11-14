import type { Bot, BotNode } from '../bots.db.schema';

/** Configuração própria de cada tipo de nó (guardada como JSON em bot_nodes.node_data). */
export interface NodeData {
    options?: Array<{ number: number; label: string; next_node_id?: string }>;
    variable_name?: string;
    data_type?: 'texto' | 'nome' | 'email' | 'telefone' | 'cpf' | 'numero';
    error_message?: string;
    transfer_message?: string;
    trigger?: 'all' | 'keywords';
    trigger_keywords?: string;
    cond_variable?: string;
    cond_operator?: 'igual' | 'diferente' | 'contem' | 'nao_contem' | 'maior' | 'menor' | 'existe';
    cond_value?: string;
    true_node_id?: string;
    false_node_id?: string;
    media_url?: string;
    media_mimetype?: string;
    media_filename?: string;
    pix_key?: string;
    pix_name?: string;
    pix_city?: string;
    pix_amount?: string;
    contact_name?: string;
    contact_phone?: string;
    rotate_contacts?: Array<{ name: string; phone: string }>;
    rotate_notify?: string;
    link?: string;
    tag_id?: string;
}

/** Variáveis da conversa ({{nome}}, {{telefone}} e o que os nós capturarem). */
export type FlowContext = Record<string, string>;

function parseJson<T extends object>(raw: string | null | undefined): T {
    if (!raw) return {} as T;
    try { return JSON.parse(raw) as T; } catch { return {} as T; }
}

export const parseNodeData = (raw: string | null | undefined) => parseJson<NodeData>(raw);
export const parseContext = (raw: string | null | undefined) => parseJson<FlowContext>(raw);

/** Substitui {{variavel}} e {variavel} pelos valores capturados (vazio se não houver). */
export function interpolate(text: string, ctx: FlowContext): string {
    return text
        .replace(/\{\{(\w+)\}\}/g, (_, k) => ctx[k] ?? '')
        .replace(/\{(\w+)\}/g, (_, k) => ctx[k] ?? '');
}

/** RN-FLX-05: o dado digitado tem o formato pedido? */
export function isValidCapture(value: string, type: NodeData['data_type']): boolean {
    const v = value.trim();
    if (!v) return false;
    switch (type) {
        case 'email':    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
        case 'telefone': return v.replace(/\D/g, '').length >= 10;
        case 'cpf':      return v.replace(/\D/g, '').length === 11;
        case 'numero':   return /^-?\d+([.,]\d+)?$/.test(v.replace(/\s/g, ''));
        case 'nome':     return /[a-zA-ZÀ-ÿ]{2,}/.test(v);
        default:         return true; // texto livre
    }
}

/** RN-FLX-06: compara uma variável da conversa (sem diferenciar maiúsculas). */
export function evaluateCondition(data: NodeData, ctx: FlowContext): boolean {
    const raw = ctx[data.cond_variable ?? ''] ?? '';
    const a = raw.trim().toLowerCase();
    const b = (data.cond_value ?? '').trim().toLowerCase();
    const num = (s: string) => Number(s.replace(',', '.'));

    switch (data.cond_operator) {
        case 'existe':     return raw.trim().length > 0;
        case 'igual':      return a === b;
        case 'diferente':  return a !== b;
        case 'contem':     return a.includes(b);
        case 'nao_contem': return !a.includes(b);
        case 'maior':      return num(a) > num(b);
        case 'menor':      return num(a) < num(b);
        default:           return false;
    }
}

/** RN-FLX-02: com gatilho por palavras-chave, a conversa só começa se a mensagem tiver uma delas. */
export function startTriggerMatches(startNode: BotNode, message: string): boolean {
    const data = parseNodeData(startNode.node_data);
    if (data.trigger !== 'keywords') return true;
    const keywords = (data.trigger_keywords ?? '').split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);
    if (keywords.length === 0) return true;
    const msg = message.toLowerCase();
    return keywords.some((k) => msg.includes(k));
}

/** RN-FLX-04: escolha no menu/enquete — pelo número, pelo nome ou pelo começo do nome. */
export function chooseOption(options: NodeData['options'], reply: string): string | null {
    const answer = reply.trim().toLowerCase();
    if (!answer) return null;
    const option = options?.find((o) =>
        String(o.number) === answer ||
        o.label.trim().toLowerCase() === answer ||
        o.label.toLowerCase().startsWith(answer));
    return option?.next_node_id ?? null;
}

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
type Weekday = typeof WEEKDAYS[number];

/**
 * RN-FLX-03: horário de funcionamento no fuso do bot. Um dia sem início ou fim
 * é fechado. Fim menor que o início atravessa a meia-noite: 22:00–02:00 vale
 * das 22h daquele dia às 2h do dia seguinte.
 */
export class WorkingHours {
    static isOpen(bot: Bot, now: Date): boolean {
        if (!bot.opening_hours) return true;
        const { day, minutes } = WorkingHours.localTime(now, bot.timezone || 'America/Sao_Paulo');
        const today = WorkingHours.span(bot, day);
        const yesterday = WorkingHours.span(bot, WEEKDAYS[(WEEKDAYS.indexOf(day) + 6) % 7]);

        if (today && today.ini < today.fin && minutes >= today.ini && minutes < today.fin) return true;
        if (today && today.ini > today.fin && minutes >= today.ini) return true;
        if (yesterday && yesterday.ini > yesterday.fin && minutes < yesterday.fin) return true;
        return false;
    }

    private static span(bot: Bot, day: Weekday): { ini: number; fin: number } | null {
        const ini = bot[`${day}_ini`];
        const fin = bot[`${day}_fin`];
        if (!ini || !fin) return null;
        return { ini: WorkingHours.toMinutes(ini), fin: WorkingHours.toMinutes(fin) };
    }

    private static toMinutes(hhmm: string): number {
        const [h, m] = hhmm.split(':').map(Number);
        return h * 60 + m;
    }

    private static localTime(now: Date, timeZone: string): { day: Weekday; minutes: number } {
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
            timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
        }).formatToParts(now).map((p) => [p.type, p.value]));
        return { day: parts.weekday.toLowerCase().slice(0, 3) as Weekday, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
    }
}

/** A conversa ficou parada além do tempo de resposta do bot? */
export function isExpired(updatedAt: Date, timerMinutes: number, now: Date): boolean {
    return (now.getTime() - new Date(updatedAt).getTime()) / 60000 >= timerMinutes;
}
