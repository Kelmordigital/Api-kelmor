"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.contactService = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const exceljs_1 = __importDefault(require("exceljs"));
const client_1 = require("../../database/client");
const atendimento_db_schema_1 = require("./atendimento.db.schema");
const pesquisa_db_schema_1 = require("../pesquisas/pesquisa.db.schema");
const etiqueta_db_schema_1 = require("../etiquetas/etiqueta.db.schema");
const socket_1 = require("../../shared/socket");
// Status IDs de ticket considerados "abertos" (pendente/em atendimento)
const OPEN_STATUSES = [1, 2];
exports.contactService = {
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
    async findOrCreate(companyId, number, name, lid, waUsername) {
        const clean = number ? number.replace(/\D/g, '') : '';
        const lidClean = lid ? lid.replace(/\D/g, '') : '';
        const username = waUsername?.trim() || null;
        // 1. Busca pelo número real (quando informado)
        if (clean) {
            const [byNumber] = await client_1.db
                .select()
                .from(atendimento_db_schema_1.contacts)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.company_id, companyId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.number, clean)))
                .limit(1);
            if (byNumber) {
                const resolved = await this._enrich(byNumber, { lidClean, username });
                // Se veio LID, funde eventuais duplicados LID-only nesse canônico
                if (lidClean)
                    await this.mergeLidDuplicates(companyId, resolved.id, lidClean);
                return resolved;
            }
        }
        // 2. Busca por LID — na coluna lid OU no legado (lid gravado errado em number)
        if (lidClean) {
            const [existing] = await client_1.db
                .select()
                .from(atendimento_db_schema_1.contacts)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.company_id, companyId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.lid, lidClean), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.number, lidClean))))
                .orderBy((0, drizzle_orm_1.asc)(atendimento_db_schema_1.contacts.id))
                .limit(1);
            if (existing) {
                const patch = {};
                // Upgrade: chegou o número real de um contato que só tinha LID
                if (clean && existing.number !== clean)
                    patch.number = clean;
                if (!existing.lid)
                    patch.lid = lidClean;
                if (username && existing.wa_username !== username)
                    patch.wa_username = username;
                let resolved = existing;
                if (Object.keys(patch).length) {
                    const [updated] = await client_1.db
                        .update(atendimento_db_schema_1.contacts)
                        .set(patch)
                        .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.id, existing.id))
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
        const fallbackName = name?.trim() ||
            clean ||
            (username ? `@${username}` : '') ||
            (lidClean ? `LID ${lidClean}` : '') ||
            'Sem nome';
        const [created] = await client_1.db
            .insert(atendimento_db_schema_1.contacts)
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
    async refreshNameFromPushName(contact, pushName, fromMe) {
        const name = pushName?.trim();
        if (!name)
            return contact;
        let newName = null;
        if (!fromMe && name !== contact.name && this._isPlaceholderName(contact)) {
            newName = name;
        }
        else if (fromMe && contact.name === name) {
            newName =
                contact.number ||
                    (contact.wa_username ? `@${contact.wa_username}` : '') ||
                    (contact.lid ? `LID ${contact.lid}` : '') ||
                    'Sem nome';
        }
        if (!newName || newName === contact.name)
            return contact;
        const [updated] = await client_1.db
            .update(atendimento_db_schema_1.contacts)
            .set({ name: newName })
            .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.id, contact.id))
            .returning();
        return updated ?? contact;
    },
    /** Nome é placeholder gerado pelo sistema (número, LID, @username, 'Sem nome')? */
    _isPlaceholderName(contact) {
        const n = (contact.name ?? '').trim();
        if (!n || n === 'Sem nome')
            return true;
        if (contact.number && n === contact.number)
            return true;
        if (contact.lid && (n === contact.lid || n === `LID ${contact.lid}`))
            return true;
        if (contact.wa_username && n === `@${contact.wa_username}`)
            return true;
        return false;
    },
    /** Preenche lid/username num contato existente sem sobrescrever dados já presentes. */
    async _enrich(contact, data) {
        const patch = {};
        if (data.lidClean && !contact.lid)
            patch.lid = data.lidClean;
        if (data.username && contact.wa_username !== data.username)
            patch.wa_username = data.username;
        if (!Object.keys(patch).length)
            return contact;
        const [updated] = await client_1.db
            .update(atendimento_db_schema_1.contacts)
            .set(patch)
            .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.id, contact.id))
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
    async mergeLidDuplicates(companyId, canonicalId, lidClean) {
        if (!lidClean)
            return;
        const dups = await client_1.db
            .select()
            .from(atendimento_db_schema_1.contacts)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.company_id, companyId), (0, drizzle_orm_1.ne)(atendimento_db_schema_1.contacts.id, canonicalId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.lid, lidClean), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.number, lidClean))));
        const lidOnly = dups.filter((d) => {
            const n = (d.number ?? '').replace(/\D/g, '');
            return n === '' || n === lidClean;
        });
        if (!lidOnly.length)
            return;
        for (const dup of lidOnly) {
            await client_1.db.update(atendimento_db_schema_1.tickets).set({ contact_id: canonicalId }).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.contact_id, dup.id));
            await client_1.db.update(atendimento_db_schema_1.atendimento_messages).set({ contact_id: canonicalId }).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.atendimento_messages.contact_id, dup.id));
            await client_1.db.update(pesquisa_db_schema_1.researchHistorics).set({ contact_id: canonicalId }).where((0, drizzle_orm_1.eq)(pesquisa_db_schema_1.researchHistorics.contact_id, dup.id));
            await client_1.db.delete(atendimento_db_schema_1.contacts).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.id, dup.id));
            console.log(`[contact] LID ${lidClean}: duplicado #${dup.id} fundido em #${canonicalId}`);
        }
        await this.consolidateOpenTickets(companyId, canonicalId);
    },
    /**
     * Após uma fusão, o canônico pode ficar com múltiplos tickets abertos.
     * Mantém o mais recente, migra as mensagens dos demais para ele e fecha os
     * excedentes (status 3), emitindo eventos para o front atualizar a lista.
     */
    async consolidateOpenTickets(companyId, contactId) {
        const open = await client_1.db
            .select()
            .from(atendimento_db_schema_1.tickets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.contact_id, contactId), (0, drizzle_orm_1.inArray)(atendimento_db_schema_1.tickets.status_id, OPEN_STATUSES), (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.deleted_at)))
            .orderBy((0, drizzle_orm_1.desc)(atendimento_db_schema_1.tickets.updated_at));
        if (open.length <= 1)
            return;
        const [primary, ...rest] = open;
        for (const t of rest) {
            await client_1.db.update(atendimento_db_schema_1.atendimento_messages).set({ ticket_id: primary.id }).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.atendimento_messages.ticket_id, t.id));
            await client_1.db.update(atendimento_db_schema_1.tickets).set({ status_id: 3, updated_at: new Date() }).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.id, t.id));
            (0, socket_1.emitToCompany)(companyId, 'ticket:closed', { ticketId: t.id });
        }
        (0, socket_1.emitToCompany)(companyId, 'ticket:updated', { ticket: primary });
    },
    async findById(id) {
        const [contact] = await client_1.db.select().from(atendimento_db_schema_1.contacts).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.id, id)).limit(1);
        return contact ?? null;
    },
    async list(companyId) {
        return client_1.db.select().from(atendimento_db_schema_1.contacts).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.company_id, companyId));
    },
    async listReport(companyId, params) {
        const { search, limit = 50, offset = 0 } = params;
        const where = search
            ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.company_id, companyId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(atendimento_db_schema_1.contacts.name, `%${search}%`), (0, drizzle_orm_1.ilike)(atendimento_db_schema_1.contacts.number, `%${search}%`), (0, drizzle_orm_1.ilike)(atendimento_db_schema_1.contacts.email, `%${search}%`)))
            : (0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.company_id, companyId);
        const [list, countRows] = await Promise.all([
            client_1.db
                .select()
                .from(atendimento_db_schema_1.contacts)
                .where(where)
                .orderBy((0, drizzle_orm_1.asc)(atendimento_db_schema_1.contacts.name))
                .limit(limit)
                .offset(offset),
            client_1.db
                .select({ count: (0, drizzle_orm_1.sql) `cast(count(*) as int)` })
                .from(atendimento_db_schema_1.contacts)
                .where(where),
        ]);
        // Etiquetas em lote pros contatos da página atual — evita N+1.
        const ids = list.map(c => String(c.id));
        const tagRows = ids.length
            ? await client_1.db
                .select({ contact_id: etiqueta_db_schema_1.contactEtiquetas.contact_id, etiqueta: etiqueta_db_schema_1.etiquetas })
                .from(etiqueta_db_schema_1.contactEtiquetas)
                .innerJoin(etiqueta_db_schema_1.etiquetas, (0, drizzle_orm_1.eq)(etiqueta_db_schema_1.contactEtiquetas.etiqueta_id, etiqueta_db_schema_1.etiquetas.id))
                .where((0, drizzle_orm_1.inArray)(etiqueta_db_schema_1.contactEtiquetas.contact_id, ids))
            : [];
        const tagsByContact = new Map();
        for (const row of tagRows) {
            const arr = tagsByContact.get(row.contact_id) ?? [];
            arr.push(row.etiqueta);
            tagsByContact.set(row.contact_id, arr);
        }
        const withTags = list.map(c => ({ ...c, tags: tagsByContact.get(String(c.id)) ?? [] }));
        return { contacts: withTags, total: countRows[0]?.count ?? 0 };
    },
    async exportExcel(companyId, search) {
        const where = search
            ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.company_id, companyId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(atendimento_db_schema_1.contacts.name, `%${search}%`), (0, drizzle_orm_1.ilike)(atendimento_db_schema_1.contacts.number, `%${search}%`), (0, drizzle_orm_1.ilike)(atendimento_db_schema_1.contacts.email, `%${search}%`)))
            : (0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.company_id, companyId);
        const list = await client_1.db
            .select()
            .from(atendimento_db_schema_1.contacts)
            .where(where)
            .orderBy((0, drizzle_orm_1.asc)(atendimento_db_schema_1.contacts.name));
        const workbook = new exceljs_1.default.Workbook();
        workbook.creator = 'Kelmor CRM';
        const sheet = workbook.addWorksheet('Contatos');
        sheet.columns = [
            { header: 'ID', key: 'id', width: 10 },
            { header: 'Nome', key: 'name', width: 30 },
            { header: 'Número', key: 'number', width: 20 },
            { header: 'E-mail', key: 'email', width: 35 },
            { header: 'Origem', key: 'origin', width: 20 },
            { header: 'Data Cadastro', key: 'created_at', width: 22 },
        ];
        const headerRow = sheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
        list.forEach(c => {
            sheet.addRow({
                id: c.id,
                name: c.name,
                number: c.number ?? '',
                email: c.email ?? '',
                origin: c.origin ?? '',
                created_at: c.created_at
                    ? new Date(c.created_at).toLocaleDateString('pt-BR')
                    : '',
            });
        });
        return Buffer.from(await workbook.xlsx.writeBuffer());
    },
};
//# sourceMappingURL=contact.service.js.map