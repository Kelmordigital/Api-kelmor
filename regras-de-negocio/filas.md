# Filas

Setores de atendimento (Suporte, Financeiro…). Organizam quem atende o quê:
o ticket entra numa fila e só os atendentes dela (com acesso à conexão) podem
pegá-lo ou recebê-lo por transferência. A fila pode distribuir os tickets
sozinha.

**Rotas** (`/api/v1/configuracao/filas`): `GET /`, `GET /all`,
`GET /userqueue`, `GET /activequeue`, `GET /:id`,
`GET /:id/:connectionId/users` (qualquer usuário da empresa);
`POST /`, `PUT /:id`, `DELETE /:id` (só admin).

## Regras

- **RN-FIL-01 — Acesso.** Qualquer usuário da empresa consulta; só `admin`
  (ou superAdmin com empresa) cria, edita e exclui. Usuário sem empresa →
  `403 Empresa não encontrada`.
- **RN-FIL-02 — Dados.** Nome obrigatório (até 255 caracteres, espaços nas
  pontas removidos), cor opcional (até 50), saudação opcional (vazia = sem
  saudação), ativa (padrão sim) e modo de distribuição (padrão
  `none`). Na edição, só os campos enviados mudam.
- **RN-FIL-03 — Listagens.** `GET /` traz todas as filas da empresa
  (inclusive desativadas); `/activequeue` só as ativas, por nome (filtros do
  atendimento); `/userqueue` as filas do usuário logado; `/all` é a lista
  paginada (`page`, `perPage` — padrão 20, máximo 100) com busca por parte do
  nome. Filas excluídas nunca aparecem.
- **RN-FIL-04 — Desativar.** A fila sai dos tickets que ainda aguardam
  atendente (pendentes); tickets já em atendimento continuam nela.
- **RN-FIL-05 — Excluir.** Exclusão lógica: a fila some e sai de **todos** os
  tickets dela (inclusive em atendimento). Bloqueada (`409`) se um bot ativo
  transfere para ela.
- **RN-FIL-06 — Quem pode atender.** Atendente da fila **e** com acesso à
  conexão do ticket (ticket sem conexão: basta a fila). Para transferir, se a
  empresa ligou "transferir só para usuários online", só quem está com o
  sistema aberto aparece.
- **RN-FIL-07 — Distribuição automática.** Quando um ticket entra numa fila
  ativa com distribuição ligada, vai direto para um atendente que esteja
  online, possa atender (RN-FIL-06) e tenha vaga (limite de atendimentos
  simultâneos, se ligado). Com um só candidato, é ele; com vários, conforme o
  modo:
  - **Menor carga atual** (`less_attendances`): menos tickets da fila em
    atendimento agora;
  - **Quem menos atendeu** (`time`): menos tickets da fila finalizados;
  - **Mais ocioso** (`attendant`): quem nunca pegou ticket da fila; senão, quem
    está há mais tempo sem mexer em um.

  Empates são sorteados. Sem candidato, o ticket fica pendente na fila. Ticket
  sem conexão nunca é distribuído.
- **RN-FIL-08 — Roteamento de ticket novo.** Sem bot ativo, se a conexão
  oferece exatamente uma fila ativa, o ticket novo já nasce nela.

## Validações e mensagens

Erros saem como `{ "error": "...", "message": "..." }`.

| Situação | Status | Mensagem |
|---|---|---|
| Sem nome / só espaços | 400 | `name é obrigatório` |
| Nome com mais de 255 caracteres | 400 | `O nome da fila deve ter no máximo 255 caracteres` |
| Cor com mais de 50 caracteres | 400 | `A cor deve ter no máximo 50 caracteres` |
| Modo de distribuição desconhecido | 400 | `Modo de distribuição inválido` |
| `enabled` não booleano | 400 | `enabled deve ser verdadeiro ou falso` |
| Id malformado | 400 | `id inválido` / `connectionId inválido` |
| Atendente tentando criar/editar/excluir | 403 | `Acesso exclusivo para administradores.` |
| Usuário sem empresa | 403 | `Empresa não encontrada` |
| Fila não existe, excluída ou de outra empresa | 404 | `Fila não encontrada` |
| Fila usada por bot ativo | 409 | `Não é possível excluir a fila, pois ela está vinculada a um chatbot.` |

## Pontos em aberto

- **Bot desativado não protege a fila**: com o bot desligado a fila pode ser
  excluída; se o bot for religado, o nó "Transferir" aponta para uma fila que
  não existe mais.
- **Desativar a fila não a tira dos atendentes nem das conexões** — só dos
  tickets pendentes. Ela continua aparecendo em `GET /` e `/userqueue`.
- A distribuição automática considera "online" só quem está conectado à
  mesma instância da API (o socket não é compartilhado entre réplicas). Com 2
  ou mais réplicas, um atendente online pode ser ignorado.
- `GET /` não tem ordem definida (as outras listas são por nome).

## Mudanças na refatoração

- Nome só com espaços na edição era gravado como nome vazio; agora `400`.
- Modo de distribuição desconhecido era trocado por `none` sem aviso; agora
  `400 Modo de distribuição inválido`.
- Id malformado, nome com mais de 255 caracteres e paginação com valor não
  numérico davam `500`; agora `400` (ou o padrão, na paginação). `perPage`
  passou a ter máximo de 100.
- `%` e `_` na busca funcionavam como curinga (`%` listava tudo); agora são
  texto.
- superAdmin (sem empresa) criando fila dava `500`; agora `403`.
- Excluir a fila e soltar os tickets agora acontecem juntos (antes, uma falha
  no meio deixava tickets apontando para fila excluída).
- Os erros passam a trazer `message` além de `error` (RN-GERAL-03).

## Código e testes

- `src/modules/filas/fila.service.ts` — `FilaService` (RN-FIL-02 a 05) e
  `QueueEligibility` (RN-FIL-06).
- `src/modules/filas/queue-distribution.ts` — `QueueDistributor` e uma
  estratégia por modo (RN-FIL-07).
- `src/modules/filas/fila.module.ts` — `queueRouting`, o que o atendimento usa
  (RN-FIL-06 a 08).
- `tests/modules/filas.test.ts`, `tests/modules/connection-auto-route.test.ts`,
  `tests/modules/ticket-transfer-queue.test.ts` e `tests/unit/filas.test.ts`.
