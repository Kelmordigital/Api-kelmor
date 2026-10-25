import { describe, it, expect, vi, afterEach } from 'vitest';
import { AgendaService } from '../../src/modules/agenda/agenda.service';
import { AgendaPeriod } from '../../src/modules/agenda/agenda-period';
import type {
    AgendamentoData, AgendamentoPatch, AgendamentoRepository,
} from '../../src/modules/agenda/agenda.repository';
import type { Agendamento } from '../../src/modules/agenda/agenda.db.schema';
import type { CalendarSync } from '../../src/modules/integracoes/calendar-sync';
import { BadRequestError, NotFoundError } from '../../src/core/errors/http-errors';

/** Regras da agenda e espelhamento no calendário externo, sem banco nem Google. */

afterEach(() => { vi.restoreAllMocks(); });

class InMemoryAgendamentos implements AgendamentoRepository {
    rows: Agendamento[] = [];
    failSetGoogleEventId = false;

    async listStartingBetween(companyId: string, start: Date, end: Date) {
        return this.rows
            .filter((r) => r.company_id === companyId && r.start_at >= start && r.start_at <= end)
            .map((r) => ({ ...r }));
    }
    async findById(id: string, companyId: string) {
        const row = this.find(id, companyId);
        return row ? { ...row } : null;
    }
    async create(companyId: string, createdBy: string, data: AgendamentoData) {
        const row = { ...data, id: `a${this.rows.length + 1}`, company_id: companyId, created_by: createdBy, google_event_id: null } as Agendamento;
        this.rows.push(row);
        return { ...row };
    }
    async update(id: string, companyId: string, patch: AgendamentoPatch) {
        const row = this.find(id, companyId);
        if (!row) return null;
        Object.assign(row, patch);
        return { ...row };
    }
    async setGoogleEventId(id: string, googleEventId: string) {
        if (this.failSetGoogleEventId) throw new Error('db down');
        const row = this.rows.find((r) => r.id === id)!;
        row.google_event_id = googleEventId;
        return { ...row };
    }
    async delete(id: string, companyId: string) {
        const row = this.find(id, companyId);
        if (!row) return null;
        this.rows = this.rows.filter((r) => r !== row);
        return { ...row };
    }
    private find(id: string, companyId: string) {
        return this.rows.find((r) => r.id === id && r.company_id === companyId);
    }
}

function make(googleEventId: string | null = 'g-1') {
    const repo = new InMemoryAgendamentos();
    const calendar = {
        createEvent: vi.fn<CalendarSync['createEvent']>(async () => googleEventId),
        updateEvent: vi.fn<CalendarSync['updateEvent']>(async () => {}),
        deleteEvent: vi.fn<CalendarSync['deleteEvent']>(async () => {}),
    };
    return { repo, calendar, service: new AgendaService(repo, calendar) };
}

const at = (iso: string) => new Date(iso);
const input = { title: 'Visita', start_at: at('2030-03-10T13:00:00Z'), end_at: at('2030-03-10T14:00:00Z') };

describe('AgendaService.create', () => {
    it('com calendário conectado: cria lá e guarda o id do evento', async () => {
        const { service, calendar } = make('g-1');
        const row = await service.create('c1', 'u1', { ...input, notes: 'n' });
        expect(row.google_event_id).toBe('g-1');
        expect(calendar.createEvent).toHaveBeenCalledWith('c1', { title: 'Visita', start_at: input.start_at, end_at: input.end_at, notes: 'n' });
    });

    it('sem calendário (ou falha lá): o agendamento vale sem id externo', async () => {
        const { service } = make(null);
        expect((await service.create('c1', 'u1', input)).google_event_id).toBeNull();
    });

    it('falha ao gravar o id externo não derruba a criação', async () => {
        const { service, repo } = make('g-1');
        repo.failSetGoogleEventId = true;
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const row = await service.create('c1', 'u1', input);
        expect(row.id).toBe('a1');
        expect(row.google_event_id).toBeNull();
    });

    it('exige início e fim, e fim não pode ser antes do início (iguais pode)', async () => {
        const { service, calendar } = make();
        await expect(service.create('c1', 'u1', { title: 'x', start_at: input.start_at })).rejects.toThrow('start_at e end_at são obrigatórios');
        await expect(service.create('c1', 'u1', { ...input, end_at: at('2030-03-10T12:59:59Z') })).rejects.toThrow('end_at não pode ser antes de start_at');
        await expect(service.create('c1', 'u1', { ...input, end_at: input.start_at })).resolves.toBeDefined();
        expect(calendar.createEvent).toHaveBeenCalledTimes(1);
    });

    it('aplica os padrões', async () => {
        const row = await make(null).service.create('c1', 'u1', input);
        expect(row).toMatchObject({
            color: '#6366f1', lead_id: null, notes: null, notify_on_create: true,
            reminder_minutes: null, remind_at_exact: false, notify_groups: [], created_by: 'u1',
        });
    });
});

describe('AgendaService.update / remove', () => {
    it('valida o intervalo com o que já está salvo', async () => {
        const { service } = make();
        const row = await service.create('c1', 'u1', input);
        await expect(service.update(row.id, 'c1', { start_at: at('2030-03-10T15:00:00Z') })).rejects.toBeInstanceOf(BadRequestError);
        await expect(service.update(row.id, 'c1', { end_at: at('2030-03-10T13:30:00Z') })).resolves.toBeDefined();
    });

    it('só espelha no calendário o que já foi sincronizado', async () => {
        const synced = make('g-1');
        const a = await synced.service.create('c1', 'u1', input);
        await synced.service.update(a.id, 'c1', { title: 'Nova' });
        expect(synced.calendar.updateEvent).toHaveBeenCalledWith('c1', 'g-1', expect.objectContaining({ title: 'Nova' }));
        await synced.service.remove(a.id, 'c1');
        expect(synced.calendar.deleteEvent).toHaveBeenCalledWith('c1', 'g-1');

        const local = make(null);
        const b = await local.service.create('c1', 'u1', input);
        await local.service.update(b.id, 'c1', { title: 'Nova' });
        await local.service.remove(b.id, 'c1');
        expect(local.calendar.updateEvent).not.toHaveBeenCalled();
        expect(local.calendar.deleteEvent).not.toHaveBeenCalled();
    });

    it('campos não enviados não são tocados', async () => {
        const { service } = make();
        const row = await service.create('c1', 'u1', { ...input, notes: 'manter', color: '#000' });
        const updated = await service.update(row.id, 'c1', { title: 'T2' });
        expect(updated).toMatchObject({ title: 'T2', notes: 'manter', color: '#000' });
    });

    it('outra empresa → NotFoundError, sem tocar no calendário', async () => {
        const { service, calendar } = make();
        const row = await service.create('c1', 'u1', input);
        await expect(service.update(row.id, 'c2', { title: 'x' })).rejects.toBeInstanceOf(NotFoundError);
        await expect(service.remove(row.id, 'c2')).rejects.toBeInstanceOf(NotFoundError);
        expect(calendar.updateEvent).not.toHaveBeenCalled();
        expect(calendar.deleteEvent).not.toHaveBeenCalled();
    });
});

describe('AgendaPeriod', () => {
    it('sem datas: mês corrente do 1º dia 00:00 ao último 23:59:59.999', () => {
        const p = AgendaPeriod.of(undefined, undefined, new Date(2030, 1, 15, 10));
        expect(p.start).toEqual(new Date(2030, 1, 1));
        expect(p.end).toEqual(new Date(2030, 1, 28, 23, 59, 59, 999));
    });

    it('datas informadas são usadas como vieram', () => {
        const start = at('2030-04-01T00:00:00Z');
        const end = at('2030-04-07T00:00:00Z');
        expect(AgendaPeriod.of(start, end)).toMatchObject({ start, end });
    });
});
