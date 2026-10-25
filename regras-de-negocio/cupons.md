# Cupons

Cupons de desconto que a empresa oferece aos clientes durante a negociação.

**Rotas:** `/api/v1/configuracao/cupons` (listar, criar, editar, remover).
Não há busca de um cupom específico.

> Hoje o sistema só **cadastra** cupons: nenhuma parte da API aplica o
> desconto numa venda ou valida um código informado pelo cliente.

## Regras

- **RN-CUP-01 — Código.** Todo cupom tem um código com até 50 caracteres.
  Espaços nas pontas são removidos e o código é guardado em **maiúsculas**
  (`promo10` vira `PROMO10`).
- **RN-CUP-02 — Código único por empresa.** Dois cupons da mesma empresa não
  podem ter o mesmo código; a comparação ignora maiúsculas e minúsculas.
  Empresas diferentes podem repetir códigos.
- **RN-CUP-03 — Tipos de cupom.** O tipo define o que o cupom dá ao cliente:

  | Tipo | O que exige | O que é guardado |
  |---|---|---|
  | `percentual` (padrão) | valor entre **1 e 100** | o percentual |
  | `fixo` | valor **maior que zero** | o valor em reais |
  | `frete_gratis` | nada | valor, se enviado (ver pontos em aberto) |
  | `brinde` | descrição do brinde | só a descrição; o valor é apagado |

  Só o `brinde` guarda descrição; nos outros tipos ela é descartada.
- **RN-CUP-04 — Valor mínimo de venda.** Opcional. Quando informado, não pode
  ser negativo. Sem ele, o cupom vale para qualquer valor.
- **RN-CUP-05 — Liberado para atendentes (`is_public`).** Ligado: qualquer
  atendente pode oferecer o cupom. Desligado (padrão): só vale se o cliente já
  chegar com o código.
- **RN-CUP-06 — Ativo.** O cupom nasce ativo, a menos que seja criado como
  inativo.
- **RN-CUP-07 — Edição parcial.** Na edição, os campos não enviados mantêm o
  valor atual e o cupom resultante passa por **todas** as regras acima de novo.
- **RN-CUP-08 — Troca de tipo descarta o valor.** Ao mudar o tipo sem enviar um
  novo valor, o valor antigo é apagado (10% não vira R$ 10). Se o novo tipo
  exige valor, a edição é recusada até que ele seja enviado.
- **RN-CUP-09 — Ordem das validações.** Quando há mais de um erro, aparece o
  primeiro desta ordem: código → tipo → regra do tipo → valor mínimo de venda.
- **RN-CUP-10 — Listagem.** Cupons da empresa, do mais recente para o mais
  antigo.
- **RN-CUP-11 — Acesso.** Só `admin`/`superAdmin`.

## Validações e mensagens

| Situação | Status | Mensagem |
|---|---|---|
| Código ausente ou em branco | 400 | `code é obrigatório` |
| Código com mais de 50 caracteres | 400 | `code não pode passar de 50 caracteres` |
| Tipo desconhecido | 400 | `type inválido` |
| `fixo`/`percentual` sem valor, ou valor ≤ 0 | 400 | `value deve ser maior que zero para este tipo de cupom` |
| `percentual` fora de 1–100 | 400 | `value (percentual) deve estar entre 1 e 100` |
| `brinde` sem descrição | 400 | `gift_description é obrigatório para cupons do tipo brinde` |
| Valor mínimo negativo | 400 | `min_sale_value não pode ser negativo` |
| Valor ou mínimo que não é número | 400 | `value deve ser um número` / `min_sale_value deve ser um número` |
| Código já usado na empresa | 409 | `Já existe um cupom com esse código` |
| Id com formato inválido | 400 | `id inválido` |
| Cupom não existe ou é de outra empresa | 404 | `Cupom não encontrado` |

## Pontos em aberto

- **Frete grátis guarda um valor enviado.** O tipo não usa valor, mas se o
  front mandar um, ele é gravado. O mais provável é que devesse ser apagado,
  como no brinde.
- **Desconto fixo não é comparado ao valor mínimo.** Dá para criar um cupom de
  R$ 100 com mínimo de R$ 50.
- **Cupons não são aplicados.** Falta definir onde o desconto entra (carrinho
  do atendimento? venda do ticket?) e como `is_public`, `is_active` e o valor
  mínimo serão checados nesse momento.

## Mudanças na refatoração

- Valor ou mínimo enviados como texto (ex.: `"dez"`) passavam pela validação e
  quebravam no banco com `500`; agora respondem `400`.
- Dois cadastros simultâneos com o mesmo código podiam passar pela checagem e
  um deles falhava com `500`; agora o segundo recebe `409`.
- Id malformado respondia `500`; agora responde `400 id inválido`.

## Código e testes

- `src/modules/cupons/cupom-type.policies.ts` — uma classe por tipo de cupom
  (RN-CUP-03). Um tipo novo é uma classe nova registrada em
  `CupomTypePolicies.default()`.
- `src/modules/cupons/cupom.definition.ts` — regras comuns, edição parcial e
  ordem das validações (RN-CUP-01, 04, 07, 08, 09).
- `tests/modules/cupons.test.ts` (API) e `tests/unit/cupom.definition.test.ts` (regras).
