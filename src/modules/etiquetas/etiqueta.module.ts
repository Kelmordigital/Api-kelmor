import { db } from '../../database/client';
import { DrizzleCompanyDirectory } from '../companies/company-directory';
import { companyPermissionsReader } from '../configuracao-geral/configuracao-geral.module';
import { DrizzleEtiquetaRepository } from './etiqueta.repository';
import { DrizzleAutomaticTagRuleRepository } from './automatic-tag-rule.repository';
import { EtiquetaService, type ContactTagger } from './etiqueta.service';
import { AutomaticTagRuleService, AutomaticTagger, type MessageAutoTagger } from './automatic-tag-rule.service';
import { AutomaticTagRuleController, EtiquetaController } from './etiqueta.controller';
import { EtiquetaRouter } from './etiqueta.routes';

/** Composição do módulo: único lugar que escolhe as implementações concretas. */
const etiquetaService = new EtiquetaService(new DrizzleEtiquetaRepository(db), new DrizzleCompanyDirectory(db));
const ruleRepository = new DrizzleAutomaticTagRuleRepository(db);

export const automaticTagRuleService = new AutomaticTagRuleService(ruleRepository);

export const etiquetaRouter = new EtiquetaRouter(
    new EtiquetaController(etiquetaService),
    new AutomaticTagRuleController(automaticTagRuleService),
);

/** Portas expostas a outros módulos: bot ("adicionar etiqueta") e atendimento (mensagens recebidas). */
export const contactTagger: ContactTagger = etiquetaService;
export const messageAutoTagger: MessageAutoTagger = new AutomaticTagger(ruleRepository, companyPermissionsReader, etiquetaService);
