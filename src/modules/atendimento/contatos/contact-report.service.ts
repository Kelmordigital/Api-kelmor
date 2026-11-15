import { eq, and, or, ilike, asc, inArray, sql } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import type { DbExecutor } from '../../../core/database/executor';
import { BR_TIME_ZONE } from '../../../core/dates/br-day';
import { contacts, type Contact } from '../atendimento.db.schema';
import { etiquetas, contactEtiquetas, type Etiqueta } from '../../etiquetas/etiqueta.db.schema';

/** Listagem, relatório paginado e exportação Excel dos contatos da empresa. */
export class ContactReportService {
    constructor(private readonly db: DbExecutor) {}

    private where(companyId: string, search?: string) {
        return search
            ? and(eq(contacts.company_id, companyId), or(
                ilike(contacts.name, `%${search}%`),
                ilike(contacts.number, `%${search}%`),
                ilike(contacts.email, `%${search}%`),
            ))
            : eq(contacts.company_id, companyId);
    }

    list(companyId: string): Promise<Contact[]> {
        return this.db.select().from(contacts).where(eq(contacts.company_id, companyId));
    }

    /** Ids dos contatos cujo nome ou número contém o termo (busca de tickets e do quadro). */
    async idsMatching(companyId: string, term: string): Promise<number[]> {
        const rows = await this.db.select({ id: contacts.id }).from(contacts).where(and(
            eq(contacts.company_id, companyId),
            or(ilike(contacts.name, `%${term}%`), ilike(contacts.number, `%${term}%`)),
        ));
        return rows.map((r) => r.id);
    }

    async listReport(
        companyId: string,
        params: { search?: string; limit?: number; offset?: number },
    ): Promise<{ contacts: (Contact & { tags: Etiqueta[] })[]; total: number }> {
        const { search, limit = 50, offset = 0 } = params;
        const where = this.where(companyId, search);

        const [list, countRows] = await Promise.all([
            this.db.select().from(contacts).where(where).orderBy(asc(contacts.name)).limit(limit).offset(offset),
            this.db.select({ count: sql<number>`cast(count(*) as int)` }).from(contacts).where(where),
        ]);

        // Etiquetas em lote pros contatos da página atual — evita N+1.
        const ids = list.map((c) => String(c.id));
        const tagRows = ids.length
            ? await this.db
                .select({ contact_id: contactEtiquetas.contact_id, etiqueta: etiquetas })
                .from(contactEtiquetas)
                .innerJoin(etiquetas, eq(contactEtiquetas.etiqueta_id, etiquetas.id))
                .where(inArray(contactEtiquetas.contact_id, ids))
            : [];

        const tagsByContact = new Map<string, Etiqueta[]>();
        for (const row of tagRows) tagsByContact.set(row.contact_id, [...(tagsByContact.get(row.contact_id) ?? []), row.etiqueta]);

        return { contacts: list.map((c) => ({ ...c, tags: tagsByContact.get(String(c.id)) ?? [] })), total: countRows[0]?.count ?? 0 };
    }

    async exportExcel(companyId: string, search?: string): Promise<Buffer> {
        const list = await this.db.select().from(contacts).where(this.where(companyId, search)).orderBy(asc(contacts.name));

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Kelmor CRM';
        const sheet = workbook.addWorksheet('Contatos');
        sheet.columns = [
            { header: 'ID',            key: 'id',         width: 10 },
            { header: 'Nome',          key: 'name',       width: 30 },
            { header: 'Número',        key: 'number',     width: 20 },
            { header: 'E-mail',        key: 'email',      width: 35 },
            { header: 'Origem',        key: 'origin',     width: 20 },
            { header: 'Data Cadastro', key: 'created_at', width: 22 },
        ];
        const headerRow = sheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };

        list.forEach((c) => sheet.addRow({
            id: c.id, name: c.name, number: c.number ?? '', email: c.email ?? '', origin: c.origin ?? '',
            created_at: c.created_at ? new Date(c.created_at).toLocaleDateString('pt-BR', { timeZone: BR_TIME_ZONE }) : '',
        }));

        return Buffer.from(await workbook.xlsx.writeBuffer() as ArrayBuffer);
    }
}
