"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSocket = initSocket;
exports.getIo = getIo;
exports.emitToCompany = emitToCompany;
const socket_io_1 = require("socket.io");
const env_1 = require("../config/env");
let io = null;
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