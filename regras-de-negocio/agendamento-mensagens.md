# Agendamento de mensagens

O atendente agenda **uma** mensagem para o contato de um ticket, a ser
enviada numa data futura pelo WhatsApp (aba "Agendar mensagem" do chat). Não
tem relação com as campanhas (disparo em massa).

**Rotas:** `POST /api/v1/atendimento/tickets/:id/schedule-message`,
`GET /api/v1/atendimento/tickets/:id/scheduled-messages`,
`PUT /api/v1/atendimento/scheduled-messages/:id` (editar) e
`DELETE /api/v1/atendimento/scheduled-messages/:id` (cancelar).

## Regras

- **RN-AGM-01 — Acesso.** Qualquer usuário da empresa, sobre tickets da
  própria empresa.
- **RN-AGM-02 — Para quem e por onde.** A mensagem vai para o contato do
  ticket, pela conexão do ticket. Ticket sem conexão não pode agendar.
- **RN-AGM-03 — Dados.** Mensagem obrigatória (até 4096 caracteres) e data de
  envio válida. Data no passado é aceita e a mensagem sai no próximo ciclo.
- **RN-AGM-04 — Textos prontos.** O modal oferece os textos de agendamento
  cadastrados pela empresa (ver [campanhas.md](campanhas.md), RN-CAM-08); o
  atendente pode editá-los antes de agendar.
- **RN-AGM-05 — Histórico.** Mostra todas as mensagens agendadas para o
  contato do ticket, de todos os tickets dele, da data mais distante para a
  mais próxima.
- **RN-AGM-10 — Editar e cancelar antes do envio.** Enquanto a mensagem está
  "Agendada", qualquer usuário da empresa pode editar o texto e/ou a data, ou
  cancelá-la (ela continua no histórico como "Cancelado" e nunca é enviada).
  Depois que o envio começou — ou se já foi enviada, falhou ou foi cancelada —
  não dá mais para alterar. Editar para uma data que já passou faz a mensagem
  sair no próximo ciclo.
- **RN-AGM-06 — Situações.** `scheduled` (aguardando), `sending` (sendo
  enviada, dura segundos), `sent` (enviada), `failed` (falhou, com o motivo) e
  `canceled`.
- **RN-AGM-07 — Quando sai.** A cada 30 segundos o servidor envia as mensagens
  cuja data já chegou; uma mensagem pode sair até ~30 s depois do horário
  marcado. Uma mensagem criada já vencida sai na hora.
- **RN-AGM-08 — Uma vez só.** Cada mensagem é enviada no máximo uma vez, mesmo
  com várias instâncias do servidor rodando (a mensagem é reservada no banco
  antes do envio). Reiniciar o servidor não perde agendamentos.
- **RN-AGM-09 — Falhas.** Contato sem número/LID ou erro no WhatsApp marcam a
  mensagem como `failed` com o motivo; ela não é reenviada. **Quem agendou e os
  administradores da empresa são avisados** no sino de notificações (e na hora,
  se estiverem com o sistema aberto), com o nome do contato, o começo da
  mensagem e o motivo; clicar abre o atendimento (ver
  [notificacoes.md](notificacoes.md)). O motivo também aparece no histórico do
  contato. Um envio
  interrompido pela queda do servidor fica como `failed` ("Envio
  interrompido") depois de 10 minutos — preferimos não reenviar a arriscar
  duplicar.

## Validações e mensagens

| Situação | Status | Mensagem |
|---|---|---|
| Sem mensagem | 400 | `message obrigatório` |
| Mensagem com mais de 4096 caracteres | 400 | `A mensagem deve ter no máximo 4096 caracteres` |
| Sem data / data inválida | 400 | `send_date obrigatório` / `send_date inválido` |
| Ticket sem conexão | 400 | `Este ticket não tem uma conexão associada — não é possível agendar mensagem.` |
| Id do ticket inválido | 400 | `id inválido` |
| Usuário sem empresa (superAdmin) | 403 | `Empresa não encontrada` |
| Ticket não existe ou é de outra empresa | 404 | `Ticket não encontrado` |
| Edição sem mensagem nem data | 400 | `Envie a mensagem e/ou a nova data` |
| Agendamento não existe ou é de outra empresa | 404 | `Agendamento não encontrado` |
| Editar/cancelar depois de enviada, cancelada ou durante o envio | 409 | `Esta mensagem não pode mais ser alterada: ela já foi enviada, cancelada ou está sendo enviada.` |

## Pontos em aberto

- **Falha não tem nova tentativa automática**: o atendente é avisado e pode
  agendar de novo.
- Qualquer usuário da empresa edita/cancela agendamentos de outros (não só
  quem criou).
- Se a conexão estiver desconectada na hora do envio, a mensagem falha.

## Mudanças na refatoração

- **Mensagens duplicadas em produção.** Cada instância da API mantinha os
  agendamentos em memória e, ao subir, reagendava **todos** os pendentes. Com
  2–3 instâncias (autoescalonamento), uma nova instância fazia o mesmo cliente
  receber a mesma mensagem mais de uma vez. Agora o envio consulta o banco e
  reserva cada mensagem (RN-AGM-08).
- **Mensagem que podia sair um ano depois.** O agendador usava uma expressão
  cron sem ano; um horário dentro do minuto corrente só disparava no ano
  seguinte. Não existe mais.
- O cron também arredondava para o minuto (a mensagem podia sair até 59 s
  **antes** do horário); agora sai no horário ou até ~30 s depois (RN-AGM-07).
- Ticket inexistente respondia `500`; agora `404`. Data inválida também dava
  `500`; agora `400`.
- **Aviso de falha** para quem agendou e os admins (RN-AGM-09), por meio do
  novo módulo de notificações.
- **Editar e cancelar** antes do envio (RN-AGM-10), com botões no histórico do
  chat; o motivo da falha passou a aparecer no histórico.
- **Fuso horário no modal do chat:** a data sugerida ("daqui a 30 min") e os
  atalhos de dias eram calculados em UTC e lidos como horário local — no
  Brasil, "daqui a 30 min" virava 3h30. Corrigido no front.
- As rotas saíram do controller do atendimento e passaram a ser deste módulo
  (mesmas URLs). A tela do chat ganhou a situação "Enviando".

## Código e testes

- `src/modules/agendamento-mensagens/agendamento-mensagens.service.ts` —
  `AgendamentoMensagensService` (agendar/histórico),
  `ScheduledMessageDispatcher` (envio, reserva e falhas) e `DispatchLoop`
  (ciclo de 30 s, iniciado no `main.ts`).
- `src/modules/agendamento-mensagens/agendamento-mensagens.repository.ts` —
  reserva com `FOR UPDATE SKIP LOCKED`.
- `tests/modules/agendamento-mensagens.test.ts` (inclui duas instâncias
  disparando ao mesmo tempo) e `tests/unit/agendamento-mensagens.test.ts`.
