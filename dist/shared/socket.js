"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isUserOnline = isUserOnline;
exports.initSocket = initSocket;
exports.getIo = getIo;
exports.emitToCompany = emitToCompany;
const socket_io_1 = require("socket.io");
const env_1 = require("../config/env");
let io = null;
// Presença de usuários logados no dashboard: userId → conjunto de socketIds ativos.
// Processo único (sem escala horizontal hoje) → Map em memória basta.
const onlineUsers = new Map();
function isUserOnline(userId) {
    const sockets = onlineUsers.get(userId);
    return !!sockets && sockets.size > 0;
}
function initSocket(httpServer) {
    io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: env_1.env.FRONTEND_URL,
            credentials: true,
        },
    });
    io.on('connection', (socket) => {
        socket.on('join:company', ({ companyId }) => {
            socket.join(`company:${companyId}`);
        });
        socket.on('join:user', ({ userId }) => {
            if (!userId)
                return;
            socket.data.userId = userId;
            let set = onlineUsers.get(userId);
            if (!set) {
                set = new Set();
                onlineUsers.set(userId, set);
            }
            set.add(socket.id);
        });
        socket.on('disconnect', () => {
            const userId = socket.data.userId;
            if (!userId)
                return;
            const set = onlineUsers.get(userId);
            if (!set)
                return;
            set.delete(socket.id);
            if (set.size === 0)
                onlineUsers.delete(userId);
        });
    });
    console.log('[socket] Socket.IO iniciado');
    return io;
}
function getIo() {
    if (!io)
        throw new Error('Socket.IO não foi inicializado');
    return io;
}
function emitToCompany(companyId, event, payload) {
    if (!io)
        return;
    io.to(`company:${companyId}`).emit(event, payload);
}
//# sourceMappingURL=socket.js.map