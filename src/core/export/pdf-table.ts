import PDFDocument from 'pdfkit';
import { cellText, type ExportedFile, type TableColumn, type TableExporter, type TableHeading } from './table-export';

export const PDF_CONTENT_TYPE = 'application/pdf';

export interface PdfTableOptions {
    /** Comprime o conteúdo das páginas (desligar só para inspecionar o texto em testes). */
    compress?: boolean;
}

/**
 * Tabela em PDF A4 com o mesmo visual da planilha: título, subtítulo,
 * cabeçalho roxo repetido a cada página, linhas zebradas e número da página.
 */
export class PdfTableWriter implements TableExporter {
    readonly format = 'pdf' as const;

    private static readonly MARGIN = 40;
    private static readonly ROW_HEIGHT = 22;
    private static readonly PADDING = 6;
    private static readonly FONT_SIZE = 10;
    private static readonly HEADER_COLOR = '#4F46E5';
    private static readonly STRIPE_COLOR = '#F5F3FF';
    private static readonly TEXT_COLOR = '#111827';
    private static readonly MUTED_COLOR = '#6B7280';

    constructor(private readonly options: PdfTableOptions = {}) {}

    export(heading: TableHeading, columns: TableColumn[], rows: object[]): Promise<ExportedFile> {
        const P = PdfTableWriter;
        const doc = new PDFDocument({
            size: 'A4', margin: P.MARGIN, bufferPages: true, compress: this.options.compress ?? true,
            info: { Title: heading.title, Producer: 'Kelmor', Creator: 'Kelmor' },
        });
        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        const done = new Promise<ExportedFile>((resolve, reject) => {
            doc.on('end', () => resolve({ content: Buffer.concat(chunks), contentType: PDF_CONTENT_TYPE, extension: this.format }));
            doc.on('error', reject);
        });

        const left = P.MARGIN;
        const tableWidth = doc.page.width - 2 * P.MARGIN;
        const bottom = doc.page.height - P.MARGIN - 20; // espaço do rodapé
        const totalWeight = columns.reduce((sum, c) => sum + c.width, 0) || 1;
        const widths = columns.map((c) => (c.width / totalWeight) * tableWidth);

        const drawRow = (y: number, cells: string[], style: 'header' | 'stripe' | 'plain') => {
            if (style !== 'plain') {
                doc.rect(left, y, tableWidth, P.ROW_HEIGHT).fill(style === 'header' ? P.HEADER_COLOR : P.STRIPE_COLOR);
            }
            doc.font(style === 'header' ? 'Helvetica-Bold' : 'Helvetica').fontSize(P.FONT_SIZE)
                .fillColor(style === 'header' ? '#FFFFFF' : P.TEXT_COLOR);
            let x = left;
            cells.forEach((text, i) => {
                doc.text(text, x + P.PADDING, y + (P.ROW_HEIGHT - P.FONT_SIZE) / 2, {
                    width: widths[i] - 2 * P.PADDING, height: P.FONT_SIZE + 2, ellipsis: true, lineBreak: false,
                    align: style === 'header' ? 'center' : 'left',
                });
                x += widths[i];
            });
        };

        // Título
        doc.font('Helvetica-Bold').fontSize(16).fillColor(P.TEXT_COLOR).text(heading.title, left, P.MARGIN);
        if (heading.subtitle) doc.font('Helvetica').fontSize(10).fillColor(P.MUTED_COLOR).text(heading.subtitle);
        let y = doc.y + 12;

        const headers = columns.map((c) => c.header);
        drawRow(y, headers, 'header');
        y += P.ROW_HEIGHT;

        if (rows.length === 0) {
            doc.font('Helvetica').fontSize(P.FONT_SIZE).fillColor(P.MUTED_COLOR)
                .text('Nenhum registro no período.', left, y + P.PADDING, { width: tableWidth, align: 'center' });
        }

        rows.forEach((row, i) => {
            if (y + P.ROW_HEIGHT > bottom) {
                doc.addPage();
                y = P.MARGIN;
                drawRow(y, headers, 'header');
                y += P.ROW_HEIGHT;
            }
            drawRow(y, columns.map((c) => cellText(row, c.key)), i % 2 === 1 ? 'stripe' : 'plain');
            y += P.ROW_HEIGHT;
        });

        // Rodapé: "Página X de Y"
        const range = doc.bufferedPageRange();
        for (let i = 0; i < range.count; i++) {
            doc.switchToPage(range.start + i);
            doc.font('Helvetica').fontSize(8).fillColor(P.MUTED_COLOR)
                .text(`Página ${i + 1} de ${range.count}`, left, doc.page.height - P.MARGIN - 10, {
                    width: tableWidth, align: 'right', lineBreak: false,
                });
        }

        doc.end();
        return done;
    }
}
