import { db } from '../../database/client';
import { emitToCompany } from '../../shared/socket';
import { DrizzleConfiguracaoGeralRepository } from './configuracao-geral.repository';
import {
    ConfiguracaoGeralService, type CompanyPermissionsReader, type CompanySettingsNotifier,
} from './configuracao-geral.service';
import { ConfiguracaoGeralController } from './configuracao-geral.controller';
import { ConfiguracaoGeralRouter } from './configuracao-geral.routes';

/** Avisa o front em tempo real pelo socket da empresa. */
const socketNotifier: CompanySettingsNotifier = {
    permissionsChanged: (companyId) => emitToCompany(companyId, 'company_permissions:updated', {}),
};

/** Composição do módulo: único lugar que escolhe as implementações concretas. */
const service = new ConfiguracaoGeralService(new DrizzleConfiguracaoGeralRepository(db), socketNotifier);

export const configuracaoGeralRouter = new ConfiguracaoGeralRouter(new ConfiguracaoGeralController(service));

/** Porta de leitura exposta a outros módulos. */
export const companyPermissionsReader: CompanyPermissionsReader = service;
