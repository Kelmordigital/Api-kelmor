import { db } from '../../database/client';
import { isUserOnline } from '../../shared/socket';
import { companyPermissionsReader } from '../configuracao-geral/configuracao-geral.module';
import { filterByCapacity } from '../atendimento/attendant-capacity.service';
import type { Queue } from '../atendimento/atendimento.db.schema';
import { DrizzleDistributionStats, DrizzleQueueRepository, type EligibleUser } from './fila.repository';
import { FilaService, QueueEligibility } from './fila.service';
import { QueueDistributor, distributionStrategies } from './queue-distribution';
import { FilaController } from './fila.controller';
import { FilaRouter } from './fila.routes';

/** Composição do módulo: único lugar que escolhe as implementações concretas. */
const repository = new DrizzleQueueRepository(db);
const service = new FilaService(repository);
const eligibility = new QueueEligibility(repository, companyPermissionsReader, { isOnline: isUserOnline }, filterByCapacity);
const distributor = new QueueDistributor(
    (queueId, companyId) => repository.findById(queueId, companyId),
    eligibility,
    distributionStrategies(new DrizzleDistributionStats(db)),
);

export const filaRouter = new FilaRouter(new FilaController(service, eligibility));

/** O que o atendimento usa das filas para rotear e transferir tickets. */
export interface QueueRouting {
    activeQueuesOfConnection(connectionId: number): Promise<Queue[]>;
    transferTargets(companyId: string, queueId: number, connectionId: number): Promise<EligibleUser[]>;
    distribute(companyId: string, queueId: number, connectionId: number | null | undefined): Promise<string | undefined>;
}

export const queueRouting: QueueRouting = {
    activeQueuesOfConnection: (connectionId) => repository.listActiveByConnection(connectionId),
    transferTargets: (companyId, queueId, connectionId) => eligibility.transferTargets(companyId, queueId, connectionId),
    distribute: (companyId, queueId, connectionId) => distributor.distribute(companyId, queueId, connectionId),
};
