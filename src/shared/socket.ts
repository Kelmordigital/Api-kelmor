import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { env } from '../config/env';
import type { AuthUser } from '../core/auth/access-token';
import { accessTokens } from '../middlewares/auth.middleware';

/**
 * Tempo real (Socket.IO). RN-RT-01: a conexão exige o token de acesso no
 * handshake (`auth: { token }`); cada pessoa entra sozinha só nas próprias
 * salas — `company:<empresa>` e `user:<id>`. Pedidos antigos do front
 * (`join:company`/`join:user`) não fazem nada: ninguém escolhe sala.
 */

export interface SocketAuthenticator {
    check(token: string | undefined): Promise<{ ok: true; user: AuthUser } | { ok: false }>;
}

/** RN-RT-02: quem está com o sistema aberto (userId → abas conectadas). Por instância da API. */
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

export function isUserOnline(userId: string): boolean {
    return presence.isOnline(userId);
}

export function initSocket(httpServer: HttpServer, authenticator: SocketAuthenticator = accessTokens): Server {
    io = new Server(httpServer, { cors: { origin: env.FRONTEND_URL, credentials: true } });

    io.use(async (socket, next) => {
        const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
        const check = await authenticator.check(typeof token === 'string' ? token : undefined).catch(() => ({ ok: false as const }));
        if (!check.ok) return next(new Error('Não autorizado'));
        (socket.data as { user?: AuthUser }).user = check.user;
        next();
    });

    io.on('connection', (socket) => {
        const user = (socket.data as { user: AuthUser }).user;
        if (user.company_id) socket.join(companyRoom(user.company_id));
        socket.join(userRoom(user.id));
        presence.add(user.id, socket.id);
        socket.on('disconnect', () => presence.remove(user.id, socket.id));
    });

    console.log('[socket] Socket.IO iniciado');
    return io;
}

export function getIo(): Server {
    if (!io) throw new Error('Socket.IO não foi inicializado');
    return io;
}

/** Envia para todos da empresa que estão com o sistema aberto. */
export function emitToCompany(companyId: string, event: string, payload: unknown) {
    io?.to(companyRoom(companyId)).emit(event, payload);
}

/** Envia só para as abas abertas de um usuário. */
export function emitToUser(userId: string, event: string, payload: unknown) {
    io?.to(userRoom(userId)).emit(event, payload);
}
