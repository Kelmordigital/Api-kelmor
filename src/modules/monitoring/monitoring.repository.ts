import type { DB } from '../../database/client';
import { connections } from '../atendimento/atendimento.db.schema';
import type { ConnectionSnapshot } from './monitoring.metrics';

/** Estado atual de todas as conexões de WhatsApp (para as métricas de sessão). */
export class DrizzleConnectionSnapshots {
    constructor(private readonly db: DB) {}

    read = async (): Promise<ConnectionSnapshot[]> => {
        const rows = await this.db.select({ id: connections.id, name: connections.name, status: connections.status }).from(connections);
        return rows.map((r) => ({ id: r.id, name: r.name, connected: r.status === 'connected' }));
    };
}
