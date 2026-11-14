import { describe, it, expect, vi } from 'vitest';
import type Redis from 'ioredis';
import { AccessTokenVerifier } from '../../src/core/auth/access-token';
import { PresenceRegistry } from '../../src/shared/socket';
import type { JwtPayload } from '../../src/config/jwt';

describe('AccessTokenVerifier', () => {
    const payload: JwtPayload = { sub: 'u1', email: 'a@b.com', company_id: 'co', profile_tag: 'user', finance: false };
    const make = (opts: { valid?: boolean; session?: string | null; redis?: boolean } = {}) => {
        const verify = vi.fn((token: string) => (opts.valid === false || token === 'ruim' ? null : payload));
        const get = vi.fn(async () => (opts.session === undefined ? '1' : opts.session));
        const redis = opts.redis === false ? null : ({ get } as unknown as Redis);
        return { get, verifier: new AccessTokenVerifier(verify, () => redis) };
    };

    it('sem token, inválido ou sem sessão no servidor → recusado com o motivo', async () => {
        expect(await make().verifier.check(undefined)).toEqual({ ok: false, reason: 'missing' });
        expect(await make().verifier.check('ruim')).toEqual({ ok: false, reason: 'invalid' });
        expect(await make({ session: null }).verifier.check('bom')).toEqual({ ok: false, reason: 'session' });
    });

    it('válido e com sessão → o usuário do token; confere a sessão da empresa certa', async () => {
        const { verifier, get } = make();
        expect(await verifier.check('bom')).toEqual({ ok: true, user: { id: 'u1', email: 'a@b.com', company_id: 'co', profile_tag: 'user', finance: false } });
        expect(get).toHaveBeenCalledWith('company-co-user-u1');
    });

    it('sem Redis, vale só o JWT', async () => {
        expect((await make({ redis: false }).verifier.check('bom')).ok).toBe(true);
    });
});

describe('PresenceRegistry', () => {
    it('online enquanto houver uma aba; remover aba desconhecida não quebra', () => {
        const presence = new PresenceRegistry();
        presence.add('u1', 's1');
        presence.add('u1', 's2');
        presence.remove('u1', 's1');
        expect(presence.isOnline('u1')).toBe(true);
        presence.remove('u1', 's2');
        expect(presence.isOnline('u1')).toBe(false);
        presence.remove('u9', 'sx');
        expect(presence.isOnline('u9')).toBe(false);
    });
});
