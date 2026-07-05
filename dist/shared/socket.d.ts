import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';
export declare function isUserOnline(userId: string): boolean;
export declare function initSocket(httpServer: HttpServer): Server;
export declare function getIo(): Server;
export declare function emitToCompany(companyId: string, event: string, payload: unknown): void;
//# sourceMappingURL=socket.d.ts.map