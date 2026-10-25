import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { companyPermissions } from '../../src/modules/configuracao-geral/configuracao-geral.db.schema';
import {
    contacts,
    connections,
    tickets,
    atendimento_messages,
} from '../../src/modules/atendimento/atendimento.db.schema';
import { etiquetas, contactEtiquetas, automaticTagRules, automaticTagRuleTags } from '../../src/modules/etiquetas/etiqueta.db.schema';
import { messageService } from '../../src/modules/atendimento/message.service';
import { MAX_AUTOMATIC_TAG_RULES } from '../../src/modules/etiquetas/automatic-tag-rule.service';
import { automaticTagRuleService } from '../../src/modules/etiquetas/etiqueta.module';

/**
 * Etiquetamento automático: uma regra tem uma lista de variações de
 * palavra-chave (separadas por vírgula) e pode apontar para múltiplas
 * etiquetas. Quando enable_automatic_tags está ligado, qualquer mensagem do
 * ticket (cliente ou atendente) que contenha uma das palavras de uma regra
 * aplica todas as etiquetas daquela regra ao contato, uma única vez.
 */

let companyId: string;
let connectionId: number;
let contactId: number;
let ticketId: number;

async function tagsDoContato(id: number): Promise<string[]> {
    const rows = await db
        .select({ name: etiquetas.name })
        .from(contactEtiquetas)
        .innerJoin(etiquetas, eq(contactEtiquetas.etiqueta_id, etiquetas.id))
        .where(eq(contactEtiquetas.contact_id, String(id)));
    return rows.map(r => r.name);
}

beforeAll(async () => {
    const [co] = await db.insert(companies)
        .values({ name: 'Empresa Auto-Tag Teste', status: true })
        .returning({ id: companies.id });
    companyId = co.id;

    const [conn] = await db.insert(connections)
        .values({ company_id: companyId, name: 'Conexão Teste', status: 'connected' })
        .returning({ id: connections.id });
    connectionId = conn.id;
});

beforeEach(async () => {
    await db.delete(atendimento_messages);
    await db.delete(contactEtiquetas);
    await db.delete(automaticTagRuleTags);
    await db.delete(automaticTagRules).where(eq(automaticTagRules.company_id, companyId));
    await db.delete(etiquetas).where(eq(etiquetas.company_id, companyId));
    await db.delete(tickets).where(eq(tickets.company_id, companyId));
    await db.delete(contacts).where(eq(contacts.company_id, companyId));
    await db.delete(companyPermissions).where(eq(companyPermissions.company_id, companyId));

    const [c] = await db.insert(contacts)
        .values({ company_id: companyId, name: 'Cliente Teste', number: '5564900000000' })
        .returning({ id: contacts.id });
    contactId = c.id;

    const [t] = await db.insert(tickets)
        .values({ company_id: companyId, contact_id: contactId, connection_id: connectionId })
        .returning({ id: tickets.id });
    ticketId = t.id;
});

describe('CRUD de regras de etiquetamento automático', () => {
    it('cria uma regra com múltiplas etiquetas associadas', async () => {
        const [tagA] = await db.insert(etiquetas).values({ company_id: companyId, name: 'Fraldas' }).returning();
        const [tagB] = await db.insert(etiquetas).values({ company_id: companyId, name: 'Linha infantil' }).returning();

        const rule = await automaticTagRuleService.create(companyId, 'fralda, frauda', [tagA.id, tagB.id]);

        expect(rule.keywords).toBe('fralda, frauda');
        expect(rule.etiqueta_ids.sort()).toEqual([tagA.id, tagB.id].sort());
    });

    it('update substitui as palavras-chave e o conjunto de etiquetas da regra', async () => {
        const [tagA] = await db.insert(etiquetas).values({ company_id: companyId, name: 'Fraldas' }).returning();
        const [tagB] = await db.insert(etiquetas).values({ company_id: companyId, name: 'Suplementos' }).returning();
        const rule = await automaticTagRuleService.create(companyId, 'fralda', [tagA.id]);

        const updated = await automaticTagRuleService.update(rule.id, companyId, 'whey, bcaa', [tagB.id]);

        expect(updated?.keywords).toBe('whey, bcaa');
        expect(updated?.etiqueta_ids).toEqual([tagB.id]);
    });

    it('remove a regra', async () => {
        const rule = await automaticTagRuleService.create(companyId, 'fralda', []);
        const ok = await automaticTagRuleService.remove(rule.id, companyId);
        expect(ok).toBe(true);
        expect(await automaticTagRuleService.list(companyId)).toEqual([]);
    });

    it('ignora ids de etiqueta que não pertencem à empresa', async () => {
        const [tagA] = await db.insert(etiquetas).values({ company_id: companyId, name: 'Fraldas' }).returning();
        const [outraEmpresa] = await db.insert(companies).values({ name: 'Outra Empresa', status: true }).returning({ id: companies.id });
        const [tagDeOutraEmpresa] = await db.insert(etiquetas).values({ company_id: outraEmpresa.id, name: 'Não é minha' }).returning();

        const rule = await automaticTagRuleService.create(companyId, 'fralda', [tagA.id, tagDeOutraEmpresa.id]);

        expect(rule.etiqueta_ids).toEqual([tagA.id]);
    });

    it('recusa criar a 11ª regra ativa para a empresa', async () => {
        for (let i = 0; i < MAX_AUTOMATIC_TAG_RULES; i++) {
            await automaticTagRuleService.create(companyId, `palavra${i}`, []);
        }
        await expect(automaticTagRuleService.create(companyId, 'palavra-extra', [])).rejects.toThrow();
    });
});

describe('Etiquetamento automático por palavra-chave', () => {
    it('aplica todas as etiquetas da regra quando a mensagem contém a palavra-chave e o flag está ligado', async () => {
        await db.insert(companyPermissions).values({ company_id: companyId, enable_automatic_tags: true });
        const [tagA] = await db.insert(etiquetas).values({ company_id: companyId, name: 'Fraldas' }).returning();
        const [tagB] = await db.insert(etiquetas).values({ company_id: companyId, name: 'Linha infantil' }).returning();
        await automaticTagRuleService.create(companyId, 'fralda', [tagA.id, tagB.id]);

        await messageService.save(ticketId, contactId, 'preciso de fralda tamanho G', false, companyId);

        const tags = await tagsDoContato(contactId);
        expect(tags).toContain('Fraldas');
        expect(tags).toContain('Linha infantil');
    });

    it('não aplica nada quando enable_automatic_tags está desligado', async () => {
        await db.insert(companyPermissions).values({ company_id: companyId, enable_automatic_tags: false });
        const [tagA] = await db.insert(etiquetas).values({ company_id: companyId, name: 'Fraldas' }).returning();
        await automaticTagRuleService.create(companyId, 'fralda', [tagA.id]);

        await messageService.save(ticketId, contactId, 'preciso de fralda', false, companyId);

        expect(await tagsDoContato(contactId)).not.toContain('Fraldas');
    });

    it('não aplica nada quando não há linha de permissão para a empresa', async () => {
        const [tagA] = await db.insert(etiquetas).values({ company_id: companyId, name: 'Fraldas' }).returning();
        await automaticTagRuleService.create(companyId, 'FRALDA', [tagA.id]);

        await messageService.save(ticketId, contactId, 'Preciso de Fralda', false, companyId);

        expect(await tagsDoContato(contactId)).not.toContain('Fraldas');
    });

    it('casa qualquer uma das variações de digitação separadas por vírgula', async () => {
        await db.insert(companyPermissions).values({ company_id: companyId, enable_automatic_tags: true });
        const [tagA] = await db.insert(etiquetas).values({ company_id: companyId, name: 'Fraldas' }).returning();
        await automaticTagRuleService.create(companyId, 'fralda, frauda, fraldinha', [tagA.id]);

        await messageService.save(ticketId, contactId, 'vc tem frauda?', false, companyId);

        expect(await tagsDoContato(contactId)).toContain('Fraldas');
    });

    it('é idempotente: mensagens repetidas não duplicam a linha em contact_etiquetas', async () => {
        await db.insert(companyPermissions).values({ company_id: companyId, enable_automatic_tags: true });
        const [tagA] = await db.insert(etiquetas).values({ company_id: companyId, name: 'Fraldas' }).returning();
        await automaticTagRuleService.create(companyId, 'fralda', [tagA.id]);

        await messageService.save(ticketId, contactId, 'fralda', false, companyId);
        await messageService.save(ticketId, contactId, 'fralda de novo', false, companyId);

        const rows = await db.select().from(contactEtiquetas).where(and(
            eq(contactEtiquetas.contact_id, String(contactId)),
            eq(contactEtiquetas.etiqueta_id, tagA.id),
        ));
        expect(rows.length).toBe(1);
    });

    it('mensagem do atendente (fromMe=true) também dispara a tag', async () => {
        await db.insert(companyPermissions).values({ company_id: companyId, enable_automatic_tags: true });
        const [tagA] = await db.insert(etiquetas).values({ company_id: companyId, name: 'Suplementos' }).returning();
        await automaticTagRuleService.create(companyId, 'whey', [tagA.id]);

        await messageService.save(ticketId, contactId, 'vou te mandar uma amostra de whey', true, companyId);

        expect(await tagsDoContato(contactId)).toContain('Suplementos');
    });

    it('regra sem etiqueta associada não quebra nada e não aplica tag alguma', async () => {
        await db.insert(companyPermissions).values({ company_id: companyId, enable_automatic_tags: true });
        await automaticTagRuleService.create(companyId, 'fralda', []);

        const msg = await messageService.save(ticketId, contactId, 'fralda', false, companyId);

        expect(msg.body).toBe('fralda');
        expect(await tagsDoContato(contactId)).toEqual([]);
    });

    it('uma falha ao aplicar a tag não impede a mensagem de ser salva', async () => {
        await db.insert(companyPermissions).values({ company_id: companyId, enable_automatic_tags: true });
        // regra com palavras vazias após trim não deve quebrar nada
        await db.insert(automaticTagRules).values({ company_id: companyId, keywords: '   ,  ,' });

        const msg = await messageService.save(ticketId, contactId, 'mensagem normal', false, companyId);

        expect(msg.body).toBe('mensagem normal');
    });
});
