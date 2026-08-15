import { Contact } from './atendimento.db.schema';
import { Etiqueta } from '../etiquetas/etiqueta.db.schema';
export declare const contactService: {
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
    findOrCreate(companyId: string, number?: string | null, name?: string, lid?: string | null, waUsername?: string | null): Promise<Contact>;
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
    refreshNameFromPushName(contact: Contact, pushName: string, fromMe: boolean): Promise<Contact>;
    /** Nome é placeholder gerado pelo sistema (número, LID, @username, 'Sem nome')? */
    _isPlaceholderName(contact: Contact): boolean;
    /** Preenche lid/username num contato existente sem sobrescrever dados já presentes. */
    _enrich(contact: Contact, data: {
        lidClean?: string;
        username?: string | null;
    }): Promise<Contact>;
    /**
     * Funde contatos LID-only duplicados no contato canônico.
     *
     * Cenário: um contato conversou primeiro via username (criando um registro
     * LID-only) e depois revelou o número (criando/atualizando o canônico). Move
     * tickets, mensagens e históricos de pesquisa dos duplicados para o canônico
     * e remove os duplicados. Só funde registros realmente LID-only (sem número
     * real), nunca contatos com número próprio.
     */
    mergeLidDuplicates(companyId: string, canonicalId: number, lidClean: string): Promise<void>;
    /**
     * Após uma fusão, o canônico pode ficar com múltiplos tickets abertos.
     * Mantém o mais recente, migra as mensagens dos demais para ele e fecha os
     * excedentes (status 3), emitindo eventos para o front atualizar a lista.
     */
    consolidateOpenTickets(companyId: string, contactId: number): Promise<void>;
    findById(id: number): Promise<Contact | null>;
    list(companyId: string): Promise<Contact[]>;
    listReport(companyId: string, params: {
        search?: string;
        limit?: number;
        offset?: number;
    }): Promise<{
        contacts: (Contact & {
            tags: Etiqueta[];
        })[];
        total: number;
    }>;
    exportExcel(companyId: string, search?: string): Promise<Buffer>;
};
//# sourceMappingURL=contact.service.d.ts.map