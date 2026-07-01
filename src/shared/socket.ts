import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { env } from '../config/env';

let io: Server | null = null;

// Presença de usuários logados no dashboard: userId → conjunto de socketIds ativos.
// Processo único (sem escala horizontal hoje) → Map em memória basta.
const onlineUsers = new Map<string, Set<string>>();

export function isUserOnline(userId: string): boolean {
    const sockets = onlineUsers.get(userId);
    return !!sockets && sockets.size > 0;
}

export function initSocket(httpServer: HttpServer): Server {
    io = new Server(httpServer, {
        cors: {
            origin: env.FRONTEND_URL,
            credentials: true,
        },
    });

    io.on('connection', (socket) => {
        socket.on('join:company', ({ companyId }: { companyId: string }) => {
            socket.join(`company:${companyId}`);
        });

        socket.on('join:user', ({ userId }: { userId: string }) => {
            if (!userId) return;
            (socket.data as { userId?: string }).userId = userId;
            let set = onlineUsers.get(userId);
            if (!set) { set = new Set(); onlineUsers.set(userId, set); }
            set.add(socket.id);
        });

        socket.on('disconnect', () => {
            const userId = (socket.data as { userId?: string }).userId;
            if (!userId) return;
            const set = onlineUsers.get(userId);
            if (!set) return;
            set.delete(socket.id);
            if (set.size === 0) onlineUsers.delete(userId);
        });
    });

    console.log('[socket] Socket.IO iniciado');
    return io;
}

export function getIo(): Server {
    if (!io) throw new Error('Socket.IO não foi inicializado');
    return io;
}

export function emitToCompany(companyId: string, event: string, payload: unknown) {
    if (!io) return;
    io.to(`company:${companyId}`).emit(event, payload);
}
