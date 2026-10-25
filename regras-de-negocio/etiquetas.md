# Etiquetas

Marcadores coloridos aplicados a contatos para organizar a base (VIP,
interessado em X, inadimplente…). Podem ser aplicados à mão, pelo bot (nó
"Adicionar etiqueta") ou automaticamente por palavras-chave nas mensagens.

**Rotas:** `/api/v1/etiquetas` (cadastro e `GET /stats`),
`/api/v1/contacts/:contactId/etiquetas[/:etiquetaId]` (etiquetas do contato) e
`/api/v1/etiquetas/regras-automaticas` (regras automáticas).

## Regras

- **RN-ETQ-01 — Acesso.** Qualquer usuário da empresa, inclusive o
  atendente, cadastra, edita e exclui etiquetas e regras automáticas.
- **RN-ETQ-02 — Cadastro.** Nome obrigatório (até 100 caracteres, sem
  espaços nas pontas). Cor padrão `#6366f1` e ícone padrão `tag`. Lista das
  mais recentes para as mais antigas.
- **RN-ETQ-03 — Edição parcial.** Só nome, cor e ícone mudam, e só os
  enviados. Uma etiqueta nunca muda de empresa.
- **RN-ETQ-04 — Etiquetas no contato.** Etiqueta e contato precisam ser da
  empresa. Aplicar de novo não duplica. Remover uma etiqueta que o contato não
  tem (ou de contato de outra empresa) não dá erro e não muda nada. A lista
  de etiquetas de um contato de outra empresa vem vazia.
- **RN-ETQ-05 — Excluir etiqueta** a remove de todos os contatos e regras.
- **RN-ETQ-06 — Estatísticas.** Para cada etiqueta: quantos contatos a têm e
  quantas vezes foi aplicada em cada um dos últimos 7 dias (hoje incluso, dias
  em UTC).
- **RN-ETQ-07 — Regras automáticas.** Cada regra tem uma lista de variações
  de palavra-chave separadas por vírgula ("fralda, frauda, fraldinha") e uma
  ou mais etiquetas. No máximo **10 regras por empresa**. Só etiquetas da
  própria empresa entram numa regra (as outras são ignoradas).
- **RN-ETQ-08 — Editar regra substitui tudo.** Palavras-chave e etiquetas
  enviadas substituem as atuais; editar sem mandar etiquetas deixa a regra sem
  etiquetas.
- **RN-ETQ-09 — Quando a regra dispara.** Com "etiquetamento automático"
  ligado em Configurações gerais, cada mensagem do atendimento é comparada
  com as regras: se **qualquer** variação aparecer em **qualquer ponto** do
  texto (sem diferenciar maiúsculas, inclusive dentro de outra palavra —
  "fralda" casa "fraldas"), as etiquetas da regra são aplicadas ao contato.
  Cada etiqueta é aplicada uma vez, mesmo que várias regras casem.
- **RN-ETQ-10 — Bot.** O nó "Adicionar etiqueta" do bot segue a RN-ETQ-04;
  se falhar, o fluxo do bot continua.

## Validações e mensagens

| Situação | Status | Mensagem |
|---|---|---|
| Nome ausente ou em branco | 400 | `name é obrigatório` |
| Nome com mais de 100 caracteres | 400 | `name deve ter no máximo 100 caracteres` |
| Cor com mais de 20 / ícone com mais de 50 caracteres | 400 | `color inválida` / `icon inválido` |
| Palavras-chave em branco | 400 | `keywords é obrigatório` |
| Etiquetas da regra com id inválido | 400 | `etiqueta_ids inválido` |
| 11ª regra da empresa | 400 | `Limite de 10 regras de etiquetamento automático atingido` |
| Id de etiqueta, regra ou contato com formato inválido | 400 | `id inválido` / `etiquetaId inválido` / `contactId inválido` |
| Etiqueta não existe ou é de outra empresa | 404 | `Etiqueta não encontrada` |
| Aplicar em contato de outra empresa | 404 | `Contato não encontrado` |
| Regra não existe ou é de outra empresa | 404 | `Regra não encontrada` |

## Pontos em aberto

- **Atendente pode excluir etiquetas e regras** da empresa inteira
  (RN-ETQ-01). Confirmar se a gestão deveria ser só do admin.
- **Palavra-chave casa dentro de outras palavras** (RN-ETQ-09): uma regra
  "par" etiqueta quem escreve "parabéns". Pode gerar etiquetas indevidas com
  palavras curtas.
- **Limite de 10 regras não é garantido sob concorrência**: duas criações
  simultâneas na 10ª regra podem passar.
- **Etiquetas de leads antigos**: o vínculo aceita ids de leads (texto) por
  herança, mas a API só aplica em contatos numéricos. O total das estatísticas
  inclui esses vínculos antigos.

## Mudanças na refatoração

- **Edição gravava o corpo inteiro** — dava para mover uma etiqueta para
  outra empresa mandando `company_id`. Agora só nome, cor e ícone (RN-ETQ-03).
- **Gráfico de 7 dias sempre zerado:** a API devolvia a série com zeros fixos.
  Agora conta as aplicações reais por dia (RN-ETQ-06), numa consulta só em vez
  de uma por etiqueta.
- Aplicar etiqueta de outra empresa, ou em contato de outra empresa,
  respondia `500`; agora `404` com a mensagem.
- Nome/cor/ícone longos demais, ids malformados e etiquetas de regra com id
  inválido davam `500`; agora `400`. A edição recusa nome em branco.
- Criar/editar regra passou a ser uma transação (antes as etiquetas antigas
  eram apagadas antes de gravar as novas).
- Erros inesperados ao criar regra eram devolvidos como `400` com a mensagem
  interna; agora só o limite de regras é `400`.

## Código e testes

- `src/modules/etiquetas/keyword-rule.ts` — quando uma regra casa (RN-ETQ-09).
- `src/modules/etiquetas/etiqueta.service.ts` — cadastro, contato, estatísticas
  e a porta `ContactTagger` (usada pelo bot).
- `src/modules/etiquetas/automatic-tag-rule.service.ts` — regras e o
  `AutomaticTagger` (porta `MessageAutoTagger`, usada pelo atendimento).
- `tests/modules/etiquetas.test.ts`, `tests/modules/automatic-tags.test.ts` e
  `tests/unit/etiquetas.test.ts`.
