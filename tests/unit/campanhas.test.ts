import { describe, it, expect, vi } from 'vitest';
import { CampaignService, ScheduledTextService } from '../../src/modules/campanhas/campanha.service';
import type { CampaignsGateway } from '../../src/modules/campanhas/campaigns.gateway';
import type { CampanhaRepository, ScheduledText } from '../../src/modules/campanhas/campanha.repository';
import { BadRequestError, NotFoundError } from '../../src/core/errors/http-errors';

function gateway(): CampaignsGateway & Record<string, ReturnType<typeof vi.fn>> {
    return {
        list: vi.fn(async () => []), create: vi.fn(async () => ({ id: 1 })), update: vi.fn(async () => {}),
        delete: vi.fn(async () => {}), play: vi.fn(async () => {}), pause: vi.fn(async () => {}),
    };
}
const resources = (ownedConnections: number[], ownedContacts: number[]) => ({
    ownedConnectionIds: vi.fn(async (_c: string, ids: number[]) => ids.filter((i) => ownedConnections.includes(i))),
    ownedContactIds: vi.fn(async (_c: string, ids: number[]) => ids.filter((i) => ownedContacts.includes(i))),
});

describe('CampaignService', () => {
    const base = { title: 'T', message: 'M', send_date: '2030-01-01T00:00:00Z' };

    it('repassa só conexões e contatos da empresa', async () => {
        const gw = gateway();
        const service = new CampaignService(gw, resources([1], [10]), {} as CampanhaRepository);
        await service.create('c1', { ...base, connection_ids: [1, 2], contact_ids: [10, 20] });
        expect(gw.create).toHaveBeenCalledWith('c1', { ...base, connection_ids: [1], contact_ids: [10] });
    });

    it('sem nenhuma conexão da empresa: recusa sem chamar o microsserviço', async () => {
        const gw = gateway();
        const service = new CampaignService(gw, resources([], []), {} as CampanhaRepository);
        await expect(service.create('c1', { ...base, connection_ids: [2] })).rejects.toEqual(new BadRequestError('Selecione ao menos uma conexão'));
        expect(gw.create).not.toHaveBeenCalled();
    });

    it('edição não manda campos ausentes nem filtra o que não veio', async () => {
        const gw = gateway();
        const filter = resources([1], []);
        await new CampaignService(gw, filter, {} as CampanhaRepository).update(5, 'c1', { title: 'Novo' });
        expect(gw.update).toHaveBeenCalledWith(5, 'c1', { title: 'Novo' });
        expect(filter.ownedConnectionIds).not.toHaveBeenCalled();
    });
});

describe('ScheduledTextService', () => {
    const row = (over: Partial<ScheduledText>) => ({ id: 1, company_id: 'c1', label: 'L', text: null, type: 1, ...over }) as ScheduledText;

    function repo(last: number) {
        return {
            listTexts: vi.fn(async () => []),
            lastTextPosition: vi.fn(async () => last),
            insertTexts: vi.fn(async (_c: string, texts: { label: string; text: string | null; type: number }[]) => texts.map((t, i) => row({ ...t, id: 100 + i }))),
            updateText: vi.fn(async (id: number, _c: string, data: { label: string; text: string | null }) => row({ id, ...data })),
            deleteText: vi.fn(async () => false),
            options: vi.fn(),
        } satisfies CampanhaRepository;
    }

    it('listar não cria nada (sem textos padrão)', async () => {
        const r = repo(0);
        expect(await new ScheduledTextService(r).list('c1')).toEqual([]);
        expect(r.insertTexts).not.toHaveBeenCalled();
    });

    it('novo texto vai para o fim da ordem', async () => {
        const r = repo(3);
        const created = await new ScheduledTextService(r).create('c1', { label: 'Recompra' });
        expect(r.insertTexts).toHaveBeenCalledWith('c1', [{ label: 'Recompra', text: null, type: 4 }]);
        expect(created.type).toBe(4);
    });

    it('excluir inexistente → NotFoundError', async () => {
        await expect(new ScheduledTextService(repo(0)).remove(9, 'c1')).rejects.toBeInstanceOf(NotFoundError);
    });
});
