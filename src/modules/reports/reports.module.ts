import { db } from '../../database/client';
import { ExcelSpreadsheetWriter } from '../../core/export/spreadsheet';
import { PdfTableWriter } from '../../core/export/pdf-table';
import { DrizzleReportsRepository } from './reports.repository';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { ReportsRouter, ReportTicketsRouter } from './reports.routes';

/** Composição do módulo: único lugar que escolhe as implementações concretas. */
const controller = new ReportsController(new ReportsService(new DrizzleReportsRepository(db), [new ExcelSpreadsheetWriter(), new PdfTableWriter()]));

export const reportsRouter = new ReportsRouter(controller);
export const reportTicketsRouter = new ReportTicketsRouter(controller);
