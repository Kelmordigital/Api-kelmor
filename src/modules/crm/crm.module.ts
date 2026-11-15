import { db } from '../../database/client';
import { DrizzleCrmConfigRepository, DrizzleSalesReportRepository, DrizzleTimelineRepository } from './crm.repository';
import { CrmConfigService, type SalesReasonsReader } from './crm-config.service';
import { TimelineService } from './crm-timeline.service';
import { SalesReportService } from './crm-reports.service';
import { CrmConfigController, CrmReportsController, CrmTimelineController } from './crm.controller';
import { CrmConfigRouter, CrmReportsRouter, CrmTimelineRouter } from './crm.routes';

/** Composição do módulo: único lugar que escolhe as implementações concretas. */
export const crmConfigService = new CrmConfigService(new DrizzleCrmConfigRepository(db));

export const crmConfigRouter = new CrmConfigRouter(new CrmConfigController(crmConfigService));

/** Porta de leitura dos motivos de não venda (usada pelo atendimento). */
export const salesReasonsReader: SalesReasonsReader = crmConfigService;
export const crmTimelineRouter = new CrmTimelineRouter(new CrmTimelineController(new TimelineService(new DrizzleTimelineRepository(db))));
export const crmReportsRouter = new CrmReportsRouter(new CrmReportsController(new SalesReportService(new DrizzleSalesReportRepository(db))));
