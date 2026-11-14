/** Coluna de uma tabela exportada; `width` é a largura relativa (em caracteres, no Excel). */
export interface TableColumn {
    header: string;
    key: string;
    width: number;
}

/** O que vai no topo do arquivo. */
export interface TableHeading {
    title: string;
    /** Linha abaixo do título (ex.: o período do relatório). */
    subtitle?: string;
}

export type ExportFormat = 'xlsx' | 'pdf';

export interface ExportedFile {
    content: Buffer;
    contentType: string;
    extension: ExportFormat;
}

/** Transforma linhas em um arquivo para download (planilha, PDF…). */
export interface TableExporter {
    readonly format: ExportFormat;
    export(heading: TableHeading, columns: TableColumn[], rows: object[]): Promise<ExportedFile>;
}

/** Valor de uma célula como texto (vazio para null/undefined). */
export function cellText(row: object, key: string): string {
    const value = (row as Record<string, unknown>)[key];
    return value === null || value === undefined ? '' : String(value);
}
