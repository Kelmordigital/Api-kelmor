# Bots (Automações) — cadastro dos fluxos

Fluxos de atendimento automático: o bot padrão ativo da empresa recebe os
contatos novos e conduz a conversa por nós (mensagem, menu, captura de dado,
PIX, transferência para fila…). Este documento cobre o **cadastro** dos fluxos;
o motor que executa os nós (`chatbot-executor`) ainda será refatorado.

**Rotas** (`/api/v1/bots`, só admin): `GET /`, `GET /stats`, `POST /`,
`PUT /:id`, `DELETE /:id`, `PATCH /:id/toggle-active`, `PATCH /:id/set-default`,
`GET /:id/nodes`, `POST /:id/nodes/sync`, `POST /upload`,
`GET /:id/nodes/:nodeId/rotate-report`.

## Regras

- **RN-BOT-01 — Acesso.** Só `admin` (ou superAdmin com empresa). Bot de
  outra empresa → `404`.
- **RN-BOT-02 — Dados do bot.** Nome (até 100 caracteres), descrição, gatilho
  (`welcome`, `keyword`, `message`, `scheduled`, `manual`), palavras-chave,
  conexão (da própria empresa), tempo de resposta em minutos (1 a 1440), horário
  de funcionamento por dia (`HH:MM`, vazio = fechado), fuso horário válido,
  mensagens de fora do horário e de saída. Nasce inativo, não padrão, com 3
  minutos e fuso de São Paulo. Só esses campos são gravados.
- **RN-BOT-03 — Bot padrão.** Só um por empresa: marcar um desmarca os outros.
  É o bot padrão **e ativo** que responde os contatos.
- **RN-BOT-04 — Salvar o fluxo.** O editor envia todos os nós de uma vez e eles
  substituem os anteriores — ou o fluxo novo é gravado inteiro, ou o anterior
  fica intacto. Ids de nó não podem se repetir.
- **RN-BOT-05 — Nó "Transferir".** Só pode apontar para fila (não excluída) da
  própria empresa.
- **RN-BOT-06 — Mídias dos nós.** Imagem, vídeo, áudio ou PDF, até 25 MB,
  gravados no storage de mídias (RN-GERAL-05).
- **RN-BOT-07 — Painel.** Fluxos ativos/total, execuções de hoje, em andamento,
  com erro e dos últimos 7 dias (série por dia), contagem por gatilho e as 8
  execuções mais recentes.
- **RN-BOT-08 — Relatório do rodízio.** Para o nó "Rotacionar contato": quantos
  leads cada contato recebeu, do mais acionado ao menos.

## Validações e mensagens

| Situação | Status | Mensagem |
|---|---|---|
| Sem nome / só espaços | 400 | `name é obrigatório` |
| Nome com mais de 100 caracteres | 400 | `O nome do bot deve ter no máximo 100 caracteres` |
| Gatilho desconhecido | 400 | `Gatilho inválido` |
| Fuso horário inválido | 400 | `Fuso horário inválido` |
| Horário fora do formato | 400 | `Horário deve estar no formato HH:MM` |
| Tempo de resposta fora de 1–1440 | 400 | `O tempo de resposta deve ser de ...` |
| Conexão de outra empresa | 400 | `Conexão não encontrada` |
| `nodes` não é lista | 400 | `nodes deve ser um array` |
| Nós com o mesmo id | 400 | `Há nós com o mesmo id no fluxo` |
| Nó "Transferir" com fila de outra empresa | 400 | `Fila do nó "<nome do nó>" não encontrada` |
| Upload de outro tipo de arquivo | 400 | `Formato não suportado. Envie imagem, vídeo, áudio ou PDF.` |
| Upload acima de 25 MB | 413 | `Arquivo maior que 25MB` |
| Id malformado | 400 | `id inválido` |
| Atendente | 403 | `Acesso exclusivo para administradores.` |
| Bot não existe ou é de outra empresa | 404 | `Bot não encontrado` |

## Pontos em aberto

- O horário de funcionamento não atravessa a meia-noite (ex.: 22:00–02:00 vira
  "sempre fechado").
- Excluir um bot não verifica se ele é o padrão: a empresa fica sem bot
  respondendo, sem aviso.

## Mudanças na refatoração

- **Editar um bot podia movê-lo para outra empresa** (o corpo era gravado
  inteiro, inclusive `company_id`, `id` e `deleted_at`). Agora só os campos do
  RN-BOT-02.
- **Salvar o fluxo com erro num nó apagava todos os nós do bot.** Agora é tudo
  ou nada (RN-BOT-04).
- Criar o bot ignorava descrição, gatilho, palavras-chave e conexão.
- Fuso horário inválido era aceito e deixava o bot mudo; horário e tempo de
  resposta não eram validados.
- O nó "Transferir" aceitava fila de outra empresa; a conexão do bot também.
- O upload aceitava qualquer arquivo (inclusive `.html`) e gravava no disco do
  pod — agora só mídia e no storage compartilhado.
- Id malformado e nome longo davam `500`; agora `400`. `node_data` corrompido
  no banco derrubava a tela do editor; agora volta vazio.
- O relatório do rodízio passou a conferir se o bot é da empresa.

## Código e testes

- `src/modules/bots/bots.service.ts` — `BotService` (RN-BOT-02 a 05, 08) e
  `BotStats` (RN-BOT-07).
- `src/modules/bots/bots.dto.ts` — validações.
- `src/modules/bots/bots.repository.ts` — `BotRepository` (cadastro),
  `BotFlowReader` e `BotConversationStore` (usados pelo motor).
- `tests/modules/bots.test.ts`, `tests/modules/chatbot-executor.test.ts`,
  `tests/modules/ticket-bot-routing.test.ts` e `tests/unit/bots.test.ts`.
