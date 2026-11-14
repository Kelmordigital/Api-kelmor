import ExcelJS from 'exceljs';
import type { ExportedFile, TableColumn, TableExporter, TableHeading } from './table-export';

export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Planilha .xlsx (aba com o nome do título) com cabeçalho em destaque e linhas zebradas. */
export class ExcelSpreadsheetWriter implements TableExporter {
    readonly format = 'xlsx' as const;
    private static readonly HEADER_COLOR = 'FF4F46E5';
    private static readonly STRIPE_COLOR = 'FFF5F3FF';

    async export(heading: TableHeading, columns: TableColumn[], rows: object[]): Promise<ExportedFile> {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet(heading.title);
        sheet.columns = columns;

        sheet.getRow(1).eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ExcelSpreadsheetWriter.HEADER_COLOR } };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });

        rows.forEach((data, i) => {
            const row = sheet.addRow(data);
            if (i % 2 === 1) {
                row.eachCell((cell) => {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ExcelSpreadsheetWriter.STRIPE_COLOR } };
                });
            }
        });

        const content = Buffer.from(await workbook.xlsx.writeBuffer());
        return { content, contentType: XLSX_CONTENT_TYPE, extension: this.format };
    }
}
