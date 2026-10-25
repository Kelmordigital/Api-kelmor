import { db } from '../../database/client';
import { emitToCompany } from '../../shared/socket';
import { DrizzleCompanyDirectory } from '../companies/company-directory';
import { DrizzleTaskRepository } from './tarefas.repository';
import { TarefasService, type BoardNotifier } from './tarefas.service';
import { TarefasController } from './tarefas.controller';
import { TarefasRouter } from './tarefas.routes';

/** Avisa pelo socket da empresa quem está com o quadro aberto. */
const socketNotifier: BoardNotifier = {
    boardChanged: ({ companyId, userId }) => emitToCompany(companyId, 'tarefa:board_changed', { owner_id: userId }),
};

/** Composição do módulo: único lugar que escolhe as implementações concretas. */
const service = new TarefasService(new DrizzleTaskRepository(db), new DrizzleCompanyDirectory(db), socketNotifier);

export const tarefasRouter = new TarefasRouter(new TarefasController(service));
