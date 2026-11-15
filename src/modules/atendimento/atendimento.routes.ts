import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middlewares/auth.middleware';
import type { HttpRouter } from '../../core/http/http-router';
import type { ContactsController, FunilController, MessagesController, TicketsController } from './atendimento.controller';

/** Rotas do atendimento (prefixo /api/v1/atendimento). Painel e financeiro ficam no módulo dashboard. */
export class AtendimentoRouter implements HttpRouter {
    constructor(
        private readonly tickets: TicketsController,
        private readonly messages: MessagesController,
        private readonly contacts: ContactsController,
        private readonly funil: FunilController,
    ) {}

    register = async (app: FastifyInstance) => {
        app.addHook('preHandler', authMiddleware);
        const { tickets: t, messages: m, contacts: c, funil: f } = this;

        // Tickets — listagem e contagem
        app.get('/tickets',                   t.list);
        app.get('/tickets/count',             t.count);
        app.get('/tickets/status-by-contact', t.statusByContact);

        // Tickets — transições de status, fechamento e venda
        app.patch('/tickets/:id/assign',           t.assign);
        app.put('/tickets/:id/return',             t.returnToQueue);
        app.put('/tickets/:id/reopen',             t.reopen);
        app.put('/tickets/:id/transfer',           t.transfer);
        app.put('/tickets/:id/pin',                t.togglePin);
        app.post('/tickets/:id/close',             t.close);
        app.post('/tickets/:id/research',          t.closeWithResearch);
        app.get('/tickets/:id/research-available', t.researchAvailable);
        app.get('/close-config',                   t.closeConfig);
        app.put('/tickets/:id/sale',               t.registerSale);

        // Mensagens
        app.get('/tickets/:id/messages',  m.list);
        app.post('/tickets/:id/messages', m.send);

        // Contatos
        app.get('/contacts/report',             c.report);
        app.get('/contacts/export',             c.exportExcel);
        app.get('/contacts',                    c.list);
        app.get('/contacts/:contactId/tickets', t.listByContact);

        // Apoio ao chat: catálogo, atendentes (transferência), motivos de perda
        app.get('/produtos',   t.listProdutos);
        app.get('/attendants', t.listAttendants);
        app.get('/reasons',    t.listReasons);

        // Funil Kanban
        app.get('/funil/cards',               f.cards);
        app.post('/funil/leads',              f.createLead);
        app.patch('/tickets/:id/funil-stage', f.moveCard);
        app.get('/funil/stages',              f.listStages);
        app.post('/funil/stages',             f.createStage);
        app.put('/funil/stages/reorder',      f.reorderStages);
        app.put('/funil/stages/:id',          f.updateStage);
        app.delete('/funil/stages/:id',       f.deleteStage);
        app.get('/funil/analytics',           f.analytics);
    };
}
