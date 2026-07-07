import { eq, and, or, ne, ilike, asc, desc, inArray, isNull, sql } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import { db } from '../../database/client';
import { contacts, tickets, atendimento_messages, Contact } from './atendimento.db.schema';
import { researchHistorics } from '../pesquisas/pesquisa.db.schema';
import { emitToCompany } from '../../shared/socket';

// Status IDs de ticket considerados "abertos" (pendente/em atendimento)
const OPEN_STATUSES = [1, 2];

export const contactService = {
    /**
     * Resolve (ou cria) o contato canônico a partir de qualquer combinação de
     * número, LID e username do WhatsApp.
     *
     * Sistema de usernames do WhatsApp (Meta 2026): um contato pode chegar SEM
     * número, identificado apenas pelo LID (`<id>@lid`). Estados possíveis:
     *   - number preenchido, lid null            → contato clássico
     *   - number null, lid preenchido            → LID-only (username, sem número)
     *   - number + lid preenchidos               → contato completo/vinculado
     *
     * @param number      Número (só dígitos, opcional — pode faltar em contato username)
     * @param name        Nome de exibição (pushName)
     * @param lid         ID numérico do @lid (ex: "205939420483821")
     * @param waUsername  Username público (@apelido) quando a Meta expõe no payload
     */
    async findOrCreate(
        companyId: string,
        number?: string | null,
        name?: string,
        lid?: string | null,
        waUsername?: string | null,
    ): Promise<Contact> {
        const clean = number ? number.replace(/\D/g, '') : '';
        const lidClean = lid ? lid.replace(/\D/g, '') : '';
        const username = waUsername?.trim() || null;

        // 1. Busca pelo número real (quando informado)
        if (clean) {
            const [byNumber] = await db
                .select()
                .from(contacts)
                .where(and(eq(contacts.company_id, companyId), eq(contacts.number, clean)))
                .limit(1);

            if (byNumber) {
                const resolved = await this._enrich(byNumber, { lidClean, username });
                // Se veio LID, funde eventuais duplicados LID-only nesse canônico
                if (lidClean) await this.mergeLidDuplicates(companyId, resolved.id, lidClean);
                return resolved;
            }
        }

        // 2. Busca por LID — na coluna lid OU no legado (lid gravado errado em number)
        if (lidClean) {
            const [existing] = await db
                .select()
                .from(contacts)
                .where(and(
                    eq(contacts.company_id, companyId),
                    or(eq(contacts.lid, lidClean), eq(contacts.number, lidClean)),
                ))
                .orderBy(asc(contacts.id))
                .limit(1);

            if (existing) {
                const patch: Partial<typeof contacts.$inferInsert> = {};
                // Upgrade: chegou o número real de um contato que só tinha LID
                if (clean && existing.number !== clean) patch.number = clean;
                if (!existing.lid) patch.lid = lidClean;
                if (username && existing.wa_username !== username) patch.wa_username = username;

                let resolved = existing;
                if (Object.keys(patch).length) {
                    const [updated] = await db
                        .update(contacts)
                        .set(patch)
                        .where(eq(contacts.id, existing.id))
                        .returning();
                    resolved = updated ?? existing;
                    if (patch.number) {
                        console.log(`[contact] LID ${lidClean} revelou número ${clean} (id=${resolved.id})`);
                    }
                }
                // Consolida duplicados LID-only remanescentes no canônico
                await this.mergeLidDuplicates(companyId, resolved.id, lidClean);
                return resolved;
            }
        }

        // 3. Cria novo contato — pode ser LID-only (number null)
        const fallbackName =
            name?.trim() ||
            clean ||
            (username ? `@${username}` : '') ||
            (lidClean ? `LID ${lidClean}` : '') ||
            'Sem nome';

        const [created] = await db
            .insert(contacts)
            .values({
                company_id: companyId,
                name: fallbackName,
                number: clean || null,
                lid: lidClean || null,
                wa_username: username,
            })
            .returning();

        return created;
    },

    /**
     * Mantém o nome de exibição coerente com o pushName da mensagem recebida.
     *
     * - Mensagem do contato (!fromMe): se o nome atual é placeholder (número,
     *   LID, @username, 'Sem nome'), assume o pushName real. Nomes "de verdade"
     *   (editados no CRM ou de pushName anterior) nunca são sobrescritos.
     * - Mensagem do dono (fromMe): pushName é o nome do DONO da conexão; se o
     *   contato ficou gravado com esse nome (bug antigo que criava vários
     *   contatos com o nome do dono), reseta para o placeholder — o pushName
     *   real assume quando o contato responder.
     */
    async refreshNameFromPushName(contact: Contact, pushName: string, fromMe: boolean): Promise<Contact> {
        const name = pushName?.trim();
        if (!name) return contact;

        let newName: string | null = null;
        if (!fromMe && name !== contact.name && this._isPlaceholderName(contact)) {
            newName = name;
        } else if (fromMe && contact.name === name) {
            newName =
                contact.number ||
                (contact.wa_username ? `@${contact.wa_username}` : '') ||
                (contact.lid ? `LID ${contact.lid}` : '') ||
                'Sem nome';
        }
        if (!newName || newName === contact.name) return contact;

        const [updated] = await db
            .update(contacts)
            .set({ name: newName })
            .where(eq(contacts.id, contact.id))
            .returning();
        return updated ?? contact;
    },

    /** Nome é placeholder gerado pelo sistema (número, LID, @username, 'Sem nome')? */
    _isPlaceholderName(contact: Contact): boolean {
        const n = (contact.name ?? '').trim();
        if (!n || n === 'Sem nome') return true;
        if (contact.number && n === contact.number) return true;
        if (contact.lid && (n === contact.lid || n === `LID ${contact.lid}`)) return true;
        if (contact.wa_username && n === `@${contact.wa_username}`) return true;
        return false;
    },

    /** Preenche lid/username num contato existente sem sobrescrever dados já presentes. */
    async _enrich(
        contact: Contact,
        data: { lidClean?: string; username?: string | null },
    ): Promise<Contact> {
        const patch: Partial<typeof contacts.$inferInsert> = {};
        if (data.lidClean && !contact.lid) patch.lid = data.lidClean;
        if (data.username && contact.wa_username !== data.username) patch.wa_username = data.username;

        if (!Object.keys(patch).length) return contact;

        const [updated] = await db
            .update(contacts)
            .set(patch)
            .where(eq(contacts.id, contact.id))
            .returning();
        return updated ?? contact;
    },

    /**
     * Funde contatos LID-only duplicados no contato canônico.
     *
     * Cenário: um contato conversou primeiro via username (criando um registro
     * LID-only) e depois revelou o número (criando/atualizando o canônico). Move
     * tickets, mensagens e históricos de pesquisa dos duplicados para o canônico
     * e remove os duplicados. Só funde registros realmente LID-only (sem número
     * real), nunca contatos com número próprio.
     */
    async mergeLidDuplicates(companyId: string, canonicalId: number, lidClean: string): Promise<void> {
        if (!lidClean) return;

        const dups = await db
            .select()
            .from(contacts)
            .where(and(
                eq(contacts.company_id, companyId),
                ne(contacts.id, canonicalId),
                or(eq(contacts.lid, lidClean), eq(contacts.number, lidClean)),
            ));

        const lidOnly = dups.filter((d) => {
            const n = (d.number ?? '').replace(/\D/g, '');
            return n === '' || n === lidClean;
        });
        if (!lidOnly.length) return;

        for (const dup of lidOnly) {
            await db.update(tickets).set({ contact_id: canonicalId }).where(eq(tickets.contact_id, dup.id));
            await db.update(atendimento_messages).set({ contact_id: canonicalId }).where(eq(atendimento_messages.contact_id, dup.id));
            await db.update(researchHistorics).set({ contact_id: canonicalId }).where(eq(researchHistorics.contact_id, dup.id));
            await db.delete(contacts).where(eq(contacts.id, dup.id));
            console.log(`[contact] LID ${lidClean}: duplicado #${dup.id} fundido em #${canonicalId}`);
        }

        await this.consolidateOpenTickets(companyId, canonicalId);
    },

    /**
     * Após uma fusão, o canônico pode ficar com múltiplos tickets abertos.
     * Mantém o mais recente, migra as mensagens dos demais para ele e fecha os
     * excedentes (status 3), emitindo eventos para o front atualizar a lista.
     */
    async consolidateOpenTickets(companyId: string, contactId: number): Promise<void> {
        const open = await db
            .select()
            .from(tickets)
            .where(and(
                eq(tickets.company_id, companyId),
                eq(tickets.contact_id, contactId),
                inArray(tickets.status_id, OPEN_STATUSES),
                isNull(tickets.deleted_at),
            ))
            .orderBy(desc(tickets.updated_at));

        if (open.length <= 1) return;

        const [primary, ...rest] = open;
        for (const t of rest) {
            await db.update(atendimento_messages).set({ ticket_id: primary.id }).where(eq(atendimento_messages.ticket_id, t.id));
            await db.update(tickets).set({ status_id: 3, updated_at: new Date() }).where(eq(tickets.id, t.id));
            emitToCompany(companyId, 'ticket:closed', { ticketId: t.id });
        }
        emitToCompany(companyId, 'ticket:updated', { ticket: primary });
    },

    async findById(id: number): Promise<Contact | null> {
        const [contact] = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
        return contact ?? null;
    },

    async list(companyId: string): Promise<Contact[]> {
        return db.select().from(contacts).where(eq(contacts.company_id, companyId));
    },

    async listReport(
        companyId: string,
        params: { search?: string; limit?: number; offset?: number }
    ): Promise<{ contacts: Contact[]; total: number }> {
        const { search, limit = 50, offset = 0 } = params;

        const where = search
            ? and(
                  eq(contacts.company_id, companyId),
                  or(
                      ilike(contacts.name,   `%${search}%`),
                      ilike(contacts.number, `%${search}%`),
                      ilike(contacts.email,  `%${search}%`)
                  )
              )
            : eq(contacts.company_id, companyId);

        const [list, countRows] = await Promise.all([
            db
                .select()
                .from(contacts)
                .where(where)
                .orderBy(asc(contacts.name))
                .limit(limit)
                .offset(offset),
            db
                .select({ count: sql<number>`cast(count(*) as int)` })
                .from(contacts)
                .where(where),
        ]);

        return { contacts: list, total: countRows[0]?.count ?? 0 };
    },

    async exportExcel(companyId: string, search?: string): Promise<Buffer> {
        const where = search
            ? and(
                  eq(contacts.company_id, companyId),
                  or(
                      ilike(contacts.name,   `%${search}%`),
                      ilike(contacts.number, `%${search}%`),
                      ilike(contacts.email,  `%${search}%`)
                  )
              )
            : eq(contacts.company_id, companyId);

        const list = await db
            .select()
            .from(contacts)
            .where(where)
            .orderBy(asc(contacts.name));

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Kelmor CRM';
        const sheet = workbook.addWorksheet('Contatos');

        sheet.columns = [
            { header: 'ID',            key: 'id',         width: 10 },
            { header: 'Nome',          key: 'name',        width: 30 },
            { header: 'Número',        key: 'number',      width: 20 },
            { header: 'E-mail',        key: 'email',       width: 35 },
            { header: 'Origem',        key: 'origin',      width: 20 },
            { header: 'Data Cadastro', key: 'created_at',  width: 22 },
        ];

        const headerRow = sheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };

        list.forEach(c => {
            sheet.addRow({
                id:         c.id,
                name:       c.name,
                number:     c.number  ?? '',
                email:      c.email   ?? '',
                origin:     c.origin  ?? '',
                created_at: c.created_at
                    ? new Date(c.created_at).toLocaleDateString('pt-BR')
                    : '',
            });
        });

        return Buffer.from(await workbook.xlsx.writeBuffer() as ArrayBuffer);
    },
};
