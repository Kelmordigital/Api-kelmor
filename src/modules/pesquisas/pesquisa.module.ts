import { eq } from 'drizzle-orm';
import { db } from '../../database/client';
import { contacts } from '../atendimento/atendimento.db.schema';
import { DrizzleResearchRepository } from './pesquisa.repository';
import {
    ResearchCatalogService, ResearchReportService, SurveyFlowService,
    type ResearchSurvey, type ResearchTicketCloser, type SurveyChannel,
} from './pesquisa.service';
import { PesquisaController } from './pesquisa.controller';
import { PesquisaRouter } from './pesquisa.routes';

/**
 * Pergunta registrada no atendimento e enviada pelo WhatsApp. Imports tardios:
 * atendimento e whatsapp também dependem deste módulo.
 */
const whatsappSurveyChannel: SurveyChannel = {
    async targetFor(contactId) {
        const [contact] = await db.select({ number: contacts.number, lid: contacts.lid })
            .from(contacts).where(eq(contacts.id, contactId)).limit(1);
        return contact?.number || (contact?.lid ? `lid:${contact.lid}` : null);
    },
    async send(ticket, target, text) {
        const { messageRecorder } = await import('../atendimento/atendimento.module');
        await messageRecorder.save(ticket.id, ticket.contact_id, text, true, ticket.company_id, { mediaType: 'auto_survey' });

        const { whatsappService } = await import('../whatsapp/whatsapp.service');
        if (ticket.connection_id) await whatsappService.sendTextToPhone(ticket.connection_id, target, text);
        else await whatsappService.sendMessage(target, text);
    },
};

const ticketCloser: ResearchTicketCloser = {
    async finalizeAfterResearch(ticketId, companyId) {
        const { researchTicketCloser } = await import('../atendimento/atendimento.module');
        await researchTicketCloser.finalizeAfterResearch(ticketId, companyId);
    },
};

/** Composição do módulo: único lugar que escolhe as implementações concretas. */
const repository = new DrizzleResearchRepository(db);

export const pesquisaRouter = new PesquisaRouter(
    new PesquisaController(new ResearchCatalogService(repository), new ResearchReportService(repository)),
);

/** Porta do fechamento com pesquisa, usada pelo atendimento e pelos webhooks do WhatsApp. */
export const researchSurvey: ResearchSurvey = new SurveyFlowService(repository, whatsappSurveyChannel, ticketCloser);
