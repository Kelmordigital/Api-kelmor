# API de mensagens (integração externa)

Permite que sistemas do cliente (loja virtual, ERP…) enviem mensagens
transacionais pelo WhatsApp da empresa ("seu pedido saiu para entrega"),
autenticados por uma chave de API.

**Rotas:**
- Pública: `POST /api/v1/api-messages/send` com header `X-Api-Key` e corpo
  `{ "connection_id", "number", "message" }`.
- Gestão da chave (admin): `GET /api/v1/company-api-keys/status`,
  `POST /api/v1/company-api-keys/generate`, `DELETE /api/v1/company-api-keys`.

## Regras

- **RN-API-01 — Uma chave por empresa.** O admin gera a chave; gerar outra
  substitui a anterior, que para de funcionar na hora. Revogar desativa sem
  gerar nova.
- **RN-API-02 — A chave só aparece uma vez.** Na resposta de quem a gerou. O
  sistema guarda só um resumo criptográfico (hash) e os primeiros caracteres
  (`kelmor_xxxxxxx`) para identificá-la na tela.
- **RN-API-03 — Chave liga/desliga.** Mesmo com chave válida, o envio só
  funciona se "mensagens via API" estiver ligado em Configurações gerais.
- **RN-API-04 — Só conexões da empresa.** A conexão informada precisa ser da
  empresa dona da chave.
- **RN-API-05 — Número.** Aceito com ou sem formatação (`+55 (11) 98888-7777`);
  é usado só com os dígitos, que devem ser de 10 a 15 (padrão internacional).
- **RN-API-06 — Mensagem.** Obrigatória, até 4096 caracteres; espaços nas
  pontas são removidos.
- **RN-API-07 — Auditoria.** Todo envio feito fica registrado (empresa,
  conexão, número, texto).
- **RN-API-08 — Histórico de conversa (opcional).** Com "criar ticket para
  mensagens da API" ligado, a mensagem também entra na conversa do contato:
  num ticket já aberto daquela conexão, ou num novo ticket já fechado, sem
  atendente. O contato é criado se não existir. A resposta traz o
  `ticket_id`.
- **RN-API-09 — Formato de erro estável.** Os erros da rota pública seguem
  `{ "statusCode": 400, "error": "Bad Request", "message": "..." }`. É um
  contrato com os sistemas dos clientes e não deve mudar.

## Validações e mensagens (rota pública)

| Situação | Status | `message` |
|---|---|---|
| Sem `X-Api-Key` | 401 | `Chave de API não fornecida` |
| Chave inválida ou revogada | 401 | `Chave de API inválida ou revogada` |
| Falta connection_id, number ou message | 400 | `connection_id, number e message são obrigatórios` |
| connection_id que não é número | 400 | `connection_id inválido` |
| Número com menos de 10 ou mais de 15 dígitos | 400 | `number inválido` |
| Mensagem com mais de 4096 caracteres | 400 | `A mensagem deve ter no máximo 4096 caracteres` |
| "Mensagens via API" desligado | 403 | `Envio de mensagens via API está desativado para esta empresa` |
| Conexão não é da empresa | 404 | `Conexão não encontrada para esta empresa` |
| Falha ao enviar pelo WhatsApp | 502 | `Falha ao enviar a mensagem pela conexão. Verifique se ela está conectada.` |

Gestão da chave pelo superAdmin (que não tem empresa) → `403`.

## Pontos em aberto

- **Envios que falham não ficam na auditoria** — só os bem-sucedidos. Para
  auditar falhas é preciso uma coluna de situação no log.
- **Sem limite próprio por chave**: vale o limite geral da API (200
  requisições por minuto por IP), que pode ser pouco para um sistema que
  dispara em lote.
- Sem confirmação de entrega/leitura para o sistema do cliente (a resposta
  diz só que foi entregue ao WhatsApp).

## Mudanças na refatoração

- Falha no WhatsApp respondia `500` genérico; agora `502` com orientação.
- connection_id não numérico dava `500`; número inválido ou mensagem só com
  espaços eram aceitos. Agora `400` (RN-API-05, RN-API-06).
- O número passa a ser guardado só com dígitos no log e no contato — antes,
  `+55 (11) …` e `5511…` podiam virar contatos diferentes.
- Gestão da chave pelo superAdmin dava `500`; agora `403`.
- O formato de erro da rota pública foi mantido exatamente (RN-API-09), com
  testes que o fixam.

## Código e testes

- `src/modules/api-messages/api-messages.service.ts` — `ApiKeyService`
  (chave), `ApiMessageService` (envio) e `parseSendRequest` (validação).
- `src/core/http/public-api-error.ts` — formato de erro das APIs públicas.
- `tests/modules/api-messages.test.ts` (inclui o contrato da API pública) e
  `tests/unit/api-messages.test.ts`.
