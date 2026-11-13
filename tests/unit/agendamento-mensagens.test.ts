import { describe, it, expect, vi } from 'vitest';
import { AgendamentoMensagensService, DispatchLoop, ScheduledMessageDispatcher, TicketSemConexaoError } from '../../src/modules/agendamento-mensagens/agendamento-mensagens.service';
import type { ScheduledMessageRepository } from '../../src/modules/agendamento-mensagens/agendamento-mensagens.repository';
import { NotFoundError } from '../../src/core/errors/http-errors';

describe('AgendamentoMensagensService', () => {
    const NOW = new Date('2030-01-01T12:00:00Z');

    function make(ticket: { contact_id: number; connection_id: number | null } | null) {
        const repo = {
            findTicket: vi.fn(async () => ticket),
            create: vi.fn(async (data: { send_date: Date }) => ({ id: 1, ...data })),
            listByContact: vi.fn(async () => []),
        } as unknown as ScheduledMessageRepository;
        const onDueNow = vi.fn();
        return { repo, onDueNow, service: new AgendamentoMensagensService(repo, onDueNow, () => NOW) };
    }

    it('usa o contato e a conexão do ticket', async () => {
        const { service, repo } = make({ contact_id: 7, connection_id: 3 });
        await service.create('c1', 50, 'u1', { message: 'Oi', send_date: '2030-01-02T10:00:00Z' });
        expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ ticket_id: 50, contact_id: 7, connection_id: 3, created_by: 'u1' }));
    });

    it('mensagem já vencida aciona o disparo na hora; futura espera o ciclo', async () => {
        const due = make({ contact_id: 7, connection_id: 3 });
        await due.service.create('c1', 50, 'u1', { message: 'Oi', send_date: '2030-01-01T11:59:00Z' });
        expect(due.onDueNow).toHaveBeenCalledTimes(1);

        const future = make({ contact_id: 7, connection_id: 3 });
        await future.service.create('c1', 50, 'u1', { message: 'Oi', send_date: '2030-01-01T12:05:00Z' });
        expect(future.onDueNow).not.toHaveBeenCalled();
    });

    it('ticket de outra empresa → 404; sem conexão → 400', async () => {
        await expect(make(null).service.create('c1', 1, 'u1', { message: 'x', send_date: '2030-01-02' })).rejects.toBeInstanceOf(NotFoundError);
        await expect(make({ contact_id: 7, connection_id: null }).service.create('c1', 1, 'u1', { message: 'x', send_date: '2030-01-02' }))
            .rejects.toBeInstanceOf(TicketSemConexaoError);
    });
});

describe('DispatchLoop', () => {
    it('não sobrepõe ciclos: um tick durante outro é ignorado', async () => {
        let release!: () => void;
        const dispatchDue = vi.fn(() => new Promise<number>((r) => { release = () => r(0); }));
        const loop = new DispatchLoop({ dispatchDue }, 60_000);

        loop.tick();
        loop.tick();
        expect(dispatchDue).toHaveBeenCalledTimes(1);

        release();
        await new Promise((r) => setImmediate(r));
        loop.tick();
        expect(dispatchDue).toHaveBeenCalledTimes(2);
    });

    it('erro no disparo não derruba o laço', async () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        const loop = new DispatchLoop({ dispatchDue: vi.fn(async () => { throw new Error('db'); }) }, 60_000);
        loop.tick();
        await new Promise((r) => setImmediate(r));
        expect(log).toHaveBeenCalled();
        log.mockRestore();
    });
});

describe('ScheduledMessageDispatcher — empresa desativada', () => {
    it('avisa quem agendou e os admins com o motivo "Empresa inativa"; nada é enviado', async () => {
        const blocked = { id: 5, company_id: 'c1', created_by: 'u1', ticket_id: 50, contact_id: 7, message: 'Promoção' };
        const repo = {
            failStuck: vi.fn(async () => []),
            failDueOfInactiveCompanies: vi.fn(async () => [blocked]),
            claimDue: vi.fn(async () => []),
            contactInfo: vi.fn(async () => ({ name: 'Ana', target: '5511' })),
        } as unknown as ScheduledMessageRepository;
        const sender = { sendText: vi.fn(async () => {}) };
        const notifier = { notify: vi.fn(async () => {}) };

        await new ScheduledMessageDispatcher(repo, sender, notifier).dispatchDue();

        expect(repo.failDueOfInactiveCompanies).toHaveBeenCalledWith(expect.any(Date), 'Empresa inativa');
        expect(sender.sendText).not.toHaveBeenCalled();
        expect(notifier.notify).toHaveBeenCalledWith(
            { companyId: 'c1', userIds: ['u1'], includeAdmins: true },
            expect.objectContaining({ body: 'Ana: "Promoção" — Empresa inativa' }),
        );
    });
});
