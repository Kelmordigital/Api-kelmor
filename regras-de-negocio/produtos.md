# Produtos

Catálogo de produtos/serviços da empresa. O admin cadastra e o atendente
consulta durante o atendimento (carrinho no chat).

**Rotas:** `/api/v1/configuracao/produtos` (CRUD, admin) e
`GET /api/v1/atendimento/produtos` (catálogo, qualquer usuário da empresa).

## Regras

- **RN-PRO-01 — Nome obrigatório.** Todo produto tem nome; espaços nas pontas
  são removidos. Nome vazio ou só com espaços é recusado, ao criar e ao editar.
- **RN-PRO-02 — Tipo de valor.** Um produto é `valor_unico` (padrão),
  `recorrente` ou `sem_valor`.
- **RN-PRO-03 — Produto sem valor não tem preço.** Se o tipo for `sem_valor`, o
  preço é apagado, mesmo que tenha sido enviado. Vale também ao mudar um
  produto existente para `sem_valor`.
- **RN-PRO-04 — Produto nasce ativo.** Todo produto criado começa ativo; só a
  edição pode desativá-lo.
- **RN-PRO-05 — Edição parcial.** Na edição, só os campos enviados mudam. Se o
  preço não for enviado, o atual é mantido.
- **RN-PRO-06 — Listagem.** Produtos da empresa, do mais recente para o mais
  antigo. O catálogo do atendimento mostra a mesma lista, inclusive os inativos.
- **RN-PRO-07 — Acesso.** Só `admin`/`superAdmin` gerenciam produtos. O
  atendente só consulta pelo catálogo do atendimento.

## Validações e mensagens

| Situação | Status | Mensagem |
|---|---|---|
| Nome ausente ou em branco | 400 | `name é obrigatório` |
| Tipo de valor desconhecido | 400 | `value_type inválido` |
| Id com formato inválido | 400 | `id inválido` |
| Produto não existe ou é de outra empresa | 404 | `Produto não encontrado` |

## Pontos em aberto

- O catálogo do atendimento lista **também os produtos inativos**. Parece que
  o atendente não deveria ver um produto desativado; falta confirmar com o
  negócio.

## Mudanças na refatoração

- A edição gravava qualquer campo enviado, inclusive `id` e `company_id`: um
  admin podia mover um produto para outra empresa. Agora só os campos do
  contrato são aceitos (RN-GERAL-04).
- Id malformado respondia `500`; agora responde `400 id inválido`.
- A edição aceitava nome vazio; agora recusa (RN-PRO-01).

## Código e testes

- `src/modules/produtos/` — `produto.service.ts` concentra as regras.
- `tests/modules/produtos.test.ts` (API) e `tests/unit/produto.service.test.ts` (regras).
