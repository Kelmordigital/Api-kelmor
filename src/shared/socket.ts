import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { env } from '../config/env';

let io: Server | null = null;

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
