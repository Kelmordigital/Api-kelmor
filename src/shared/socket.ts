import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import IORedis from 'ioredis';
import type { Server as HttpServer } from 'http';
import { env } from '../config/env';
import type { AuthUser } from '../core/auth/access-token';
import { accessTokens } from '../middlewares/auth.middleware';

/**
 * Tempo real (Socket.IO). RN-RT-01: a conexão exige o token de acesso no
 * handshake (`auth: { token }`); cada pessoa entra sozinha só nas próprias
 * salas — `company:<empresa>` e `user:<id>`. Pedidos antigos do front
 * (`join:company`/`join:user`) não fazem nada: ninguém escolhe sala.
 *
 * Com REDIS_URL, os eventos e a presença valem entre todas as cópias da API
 * (adapter Redis). Sem Redis (dev local), tudo fica na memória desta cópia.
 */

export interface SocketAuthenticator {
    check(token: string | undefined): Promise<{ ok: true; user: AuthUser } | { ok: false }>;
}

/** RN-RT-02: quem está com o sistema aberto NESTA cópia (userId → abas conectadas). */
export class PresenceRegistry {
    private readonly sockets = new Map<string, Set<string>>();

    add(userId: string, socketId: string): void {
        let set = this.sockets.get(userId);
        if (!set) { set = new Set(); this.sockets.set(userId, set); }
        set.add(socketId);
    }

    remove(userId: string, socketId: string): void {
        const set = this.sockets.get(userId);
        if (!set) return;
        set.delete(socketId);
        if (set.size === 0) this.sockets.delete(userId);
    }

    isOnline(userId: string): boolean {
        return (this.sockets.get(userId)?.size ?? 0) > 0;
    }
}

const companyRoom = (companyId: string) => `company:${companyId}`;
const userRoom = (userId: string) => `user:${userId}`;

let io: Server | null = null;
const presence = new PresenceRegistry();
const redisClients = new WeakMap<Server, IORedis[]>();

/**
 * Prefixo dos canais do adapter. Pub/sub do Redis ignora o número do banco: prod (banco 0)
 * e dev (banco 1) no mesmo servidor precisam de prefixos diferentes, senão um recebe os
 * eventos do outro. SOCKET_REDIS_KEY sobrescreve.
 */
export function socketRedisKey(redisUrl: string, override?: string): string {
    if (override) return override;
    let dbIndex = 0;
    try {
        const n = Number(new URL(redisUrl).pathname.replace('/', '') || 0);
        dbIndex = Number.isFinite(n) ? n : 0;
    } catch { /* URL fora do padrão: banco 0 */ }
    return `socket.io#db${dbIndex}`;
}

/** Cria o servidor Socket.IO com autenticação, salas, presença local e (com Redis) o adapter do cluster. */
export function createSocketServer(
    httpServer: HttpServer,
    authenticator: SocketAuthenticator = accessTokens,
    redisUrl: string | undefined = env.REDIS_URL,
): Server {
    const server = new Server(httpServer, { cors: { origin: env.FRONTEND_URL, credentials: true } });

    if (redisUrl) {
        const pub = new IORedis(redisUrl, { maxRetriesPerRequest: 3 });
        const sub = pub.duplicate();
        for (const c of [pub, sub]) c.on('error', (err: Error) => console.error('[socket] Redis do adapter:', err.message));
        server.adapter(createAdapter(pub, sub, { key: socketRedisKey(redisUrl, env.SOCKET_REDIS_KEY), requestsTimeout: 2000 }));
        redisClients.set(server, [pub, sub]);
    }

    server.use(async (socket, next) => {
        const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
        const check = await authenticator.check(typeof token === 'string' ? token : undefined).catch(() => ({ ok: false as const }));
        if (!check.ok) return next(new Error('Não autorizado'));
        (socket.data as { user?: AuthUser }).user = check.user;
        next();
    });

    server.on('connection', (socket) => {
        const user = (socket.data as { user: AuthUser }).user;
        if (user.company_id) socket.join(companyRoom(user.company_id));
        socket.join(userRoom(user.id));
        presence.add(user.id, socket.id);
        socket.on('disconnect', () => presence.remove(user.id, socket.id));
    });

    return server;
}

/** Fecha o servidor e as conexões Redis do adapter (testes e shutdown). */
export async function closeSocketServer(server: Server): Promise<void> {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const c of redisClients.get(server) ?? []) await c.quit().catch(() => c.disconnect());
    if (server === io) io = null;
}

export function initSocket(httpServer: HttpServer, authenticator: SocketAuthenticator = accessTokens): Server {
    io = createSocketServer(httpServer, authenticator, env.REDIS_URL);
    console.log('[socket] Socket.IO iniciado');
    return io;
}

export function getIo(): Server {
    if (!io) throw new Error('Socket.IO não foi inicializado');
    return io;
}

/** Presença só desta cópia da API (síncrona). */
export function isUserOnline(userId: string): boolean {
    return presence.isOnline(userId);
}

/**
 * Quem, dentre `userIds`, tem ao menos uma aba conectada em QUALQUER cópia da API.
 * Se o cluster não responder (Redis fora/lento), cai para a presença local e loga.
 */
export async function resolveOnline(
    userIds: string[],
    fetchRemote: (rooms: string[]) => Promise<Array<{ data: unknown }>>,
    isLocal: (userId: string) => boolean,
    log: (message: string) => void = (m) => console.error(m),
): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    try {
        const sockets = await fetchRemote(userIds.map(userRoom));
        const wanted = new Set(userIds);
        const online = new Set<string>();
        for (const s of sockets) {
            const id = (s.data as { user?: { id?: string } } | undefined)?.user?.id;
            if (id && wanted.has(id)) online.add(id);
        }
        return online;
    } catch (err) {
        log(`[socket] presença do cluster indisponível, usando a local: ${err instanceof Error ? err.message : String(err)}`);
        return new Set(userIds.filter(isLocal));
    }
}

export async function onlineUsers(userIds: string[]): Promise<Set<string>> {
    const server = io;
    if (!server) return new Set(userIds.filter(isUserOnline));
    return resolveOnline(userIds, (rooms) => server.in(rooms).fetchSockets(), isUserOnline);
}

/** Envia para todos da empresa que estão com o sistema aberto. */
export function emitToCompany(companyId: string, event: string, payload: unknown) {
    io?.to(companyRoom(companyId)).emit(event, payload);
}

/** Envia só para as abas abertas de um usuário. */
export function emitToUser(userId: string, event: string, payload: unknown) {
    io?.to(userRoom(userId)).emit(event, payload);
}
