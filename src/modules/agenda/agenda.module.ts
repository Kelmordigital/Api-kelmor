import { db } from '../../database/client';
import { calendarSync } from '../integracoes/integracao.module';
import { DrizzleAgendamentoRepository } from './agenda.repository';
import { AgendaService } from './agenda.service';
import { AgendaController } from './agenda.controller';
import { AgendaRouter } from './agenda.routes';

/** Composição do módulo: único lugar que escolhe as implementações concretas. */
const agendaService = new AgendaService(new DrizzleAgendamentoRepository(db), calendarSync);

export const agendaRouter = new AgendaRouter(new AgendaController(agendaService));
