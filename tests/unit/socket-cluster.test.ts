import { describe, it, expect, vi } from 'vitest';
import { socketRedisKey, resolveOnline } from '../../src/shared/socket';

describe('prefixo dos canais do Socket.IO no Redis', () => {
    it('separa os ambientes pelo número do banco do REDIS_URL', () => {
        expect(socketRedisKey('redis://h:6379/0')).toBe('socket.io#db0');
        expect(socketRedisKey('redis://:senha@10.0.0.4:6379/1')).toBe('socket.io#db1');
        expect(socketRedisKey('redis://h:6379')).toBe('socket.io#db0');
    });

    it('SOCKET_REDIS_KEY sobrescreve', () => {
        expect(socketRedisKey('redis://h:6379/1', 'custom')).toBe('custom');
    });
});

describe('presença no cluster', () => {
    it('usa o cluster quando ele responde', async () => {
        const remote = async () => [{ data: { user: { id: 'a' } } }, { data: { user: { id: 'x' } } }];
        expect(await resolveOnline(['a', 'b'], remote, () => false)).toEqual(new Set(['a']));
    });

    it('Redis fora do ar → cai para a presença local e loga (Review Focus 5)', async () => {
        const log = vi.fn();
        const remote = async () => { throw new Error('timeout'); };
        expect(await resolveOnline(['a', 'b'], remote, (id) => id === 'b', log)).toEqual(new Set(['b']));
        expect(log).toHaveBeenCalledWith(expect.stringContaining('presença do cluster indisponível'));
    });
});
