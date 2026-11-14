# Configurações gerais

As chaves que ligam e desligam comportamentos da empresa: mensagens
automáticas, fechamento automático de tickets, o que o atendente pode ver e
fazer, funcionalidades extras (CRM, kanban, gamificação…) e e-mails que
recebem avisos. Vários módulos consultam essas chaves.

**Rotas:** `GET` e `PUT /api/v1/configuracao/configuracoes-gerais`.

## Regras

- **RN-CFG-01 — Uma configuração por empresa.** Criada automaticamente com os
  valores padrão na primeira vez em que alguém da empresa a consulta.
- **RN-CFG-02 — Todos leem, só admin altera.** Qualquer usuário da empresa,
  inclusive o atendente, lê a configuração (o front precisa dela para saber o
  que mostrar). Só `admin`/`superAdmin` altera. O superAdmin, que não tem
  empresa, não tem configuração.
- **RN-CFG-03 — Edição parcial.** Só as chaves enviadas mudam. Campos que não
  são configuração (id, empresa, datas) são ignorados, para que o front possa
  reenviar o formulário inteiro.
- **RN-CFG-04 — Tudo ou nada.** Mensagens, chaves e e-mails de uma alteração
  são gravados juntos; se algo for recusado, nada é gravado.
- **RN-CFG-05 — Mensagens automáticas** (boas-vindas, encerramento,
  transferência) vêm do editor de texto com formatação e são guardadas como
  vieram. Mensagem sem texto além da formatação conta como "sem mensagem".
- **RN-CFG-06 — E-mails de aviso.** A lista enviada substitui a anterior.
  Espaços são removidos, tudo vira minúsculas, vazios e repetidos são
  descartados e e-mail malformado é recusado. Lista vazia remove todos.
- **RN-CFG-07 — Limites numéricos.**

  | Chave | Padrão | Aceita |
  |---|---|---|
  | Fechar tickets abertos após (h) — `close_open_tickets_interval` | 24 | inteiro ≥ 0 |
  | Fechar tickets pendentes após (h) — `close_pending_tickets_interval` | 48 | inteiro ≥ 0 |

  O fechamento automático que usa essas duas chaves está em
  [atendimento-automatico.md](atendimento-automatico.md).
  | Intervalo entre mensagens de encerramento (h) | 6 | número ≥ 0 |
  | Intervalo entre mensagens de boas-vindas (h) | 1 | número ≥ 0 |
  | Intervalo entre pesquisas NPS (h) | 24 | número ≥ 0 |
  | Minutos antes de enviar a pesquisa — `research_interval` | 5 | inteiro ≥ 0 |
  | Atendimentos simultâneos por atendente — `number_limit_services_users` | 5 | inteiro ≥ 1 |
  | XP por venda — `sale_xp_amount` | 10 | inteiro ≥ 0 |
  | Fila para tickets parados no bot — `idle_bot_ticket_queue_id` | nenhuma | id de fila ou vazio |

- **RN-CFG-08 — Chaves liga/desliga.** As demais são sim/não. Padrões ligados:
  mostrar nome do atendente na mensagem, enviar despedida, enviar mensagem de
  transferência, transferir entre conexões, atualizar nome do contato e
  gamificação. Todas as outras começam desligadas.
- **RN-CFG-09 — Mudança vale na hora.** Depois de salvar, todos os usuários da
  empresa com o sistema aberto recebem a configuração nova em tempo real.

## Validações e mensagens

| Situação | Status | Mensagem |
|---|---|---|
| Chave sim/não com outro valor | 400 | `<chave> inválido` |
| Número fora do limite ou com fração onde só cabe inteiro | 400 | `<chave> inválido` |
| Mensagem que não é texto | 400 | `<mensagem> inválido` |
| E-mail malformado na lista | 400 | `E-mail inválido: <e-mail>` |
| Usuário sem empresa (superAdmin) | 403 | `Empresa não encontrada` |
| Atendente tentando alterar | 403 | `Acesso exclusivo para administradores.` |

## Pontos em aberto

- **A fila de "ticket parado no bot" não é conferida.** Dá para apontar para
  uma fila que não existe ou é de outra empresa.
- **Algumas chaves não aparecem na tela** (ex.: `internal_chat`,
  `order_tickets`) mas podem ser alteradas pela API. Falta saber se ainda são
  usadas.
- **HTML das mensagens não é filtrado.** É guardado como veio do editor; se
  alguma tela o exibir sem tratamento, um admin poderia injetar script.
- `research_interval` está em minutos e os outros intervalos em horas; os
  nomes não deixam isso claro.

## Mudanças na refatoração

- Valores de tipo errado (ex.: texto numa chave sim/não ou num número) davam
  `500`; agora `400` com a chave na mensagem. As telas de configuração passam
  a mostrar essa mensagem em vez de "Erro ao salvar configurações".
- Eram aceitos intervalos negativos, limite de 0 atendimentos por atendente,
  XP de venda negativo e e-mails malformados. Agora são recusados (RN-CFG-06,
  RN-CFG-07).
- A gravação não era atômica: uma falha no meio podia deixar, por exemplo, a
  lista de e-mails apagada sem a nova. Agora é uma transação (RN-CFG-04).
- Duas consultas simultâneas de uma empresa ainda sem configuração podiam dar
  `500`. Corrigido.
- Leitura pelo superAdmin dava `500`; agora `403`.
- E-mails passam a ser guardados em minúsculas.

## Código e testes

- `src/modules/configuracao-geral/configuracao-geral.dto.ts` — chaves
  editáveis por tipo e seus limites. Coluna nova na tabela só fica editável
  quando entra numa dessas listas; um teste falha se alguma ficar de fora.
- `src/modules/configuracao-geral/configuracao-geral.service.ts` — mensagens,
  e-mails e a porta `CompanyPermissionsReader`, usada por tickets, filas,
  conquistas e API de mensagens.
- `tests/modules/configuracao-geral.test.ts`,
  `tests/modules/configuracao-geral-permissions.test.ts` e
  `tests/unit/configuracao-geral.test.ts`.
