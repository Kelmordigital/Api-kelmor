# Atendimento automático — fechamento de tickets e troca de número

Duas regras que agem sem o atendente: o fechamento automático de tickets parados
e a resposta por outro número quando o número do ticket caiu.

Código: `src/modules/atendimento/ticket-auto-close.ts` (job, a cada 5 min) e
`ticketService.resolveSendConnection` em `ticket.service.ts`.

## Fechamento automático

Ligado em **Configurações → Fechar tickets abertos após (h)** e **Fechar tickets
pendentes após (h)** (`close_open_tickets*` e `close_pending_tickets*`). Até esta
versão essas opções eram salvas, mas nada as usava.

- **RN-AUTO-01 — Quando fecha.** O ticket é finalizado sozinho quando:
  1. está Pendente (1), Em Atendimento (2) ou no Bot (9);
  2. foi aberto há pelo menos X horas (X = intervalo de **pendentes** para o
     status 1 e de **abertos** para os status 2 e 9, cada um com sua chave
     liga/desliga); e
  3. a **última mensagem do ticket é do cliente**.

  Decisão do negócio: as horas contam desde a abertura do ticket, não desde a
  última mensagem. Se o atendente respondeu por último, o ticket não fecha
  sozinho. Ticket sem nenhuma mensagem também não fecha. Intervalo menor que 1 h
  é tratado como desligado.
- **RN-AUTO-02 — Não fecha:** ticket em Pesquisa de Satisfação (7), que aguarda
  a resposta do cliente; ticket apagado; empresa desativada (sem envio
  automático, como em superadmin).
- **RN-AUTO-03 — Despedida.** Ao fechar, envia a mensagem de despedida
  respeitando "Enviar mensagem de despedida" da empresa e o intervalo mínimo
  entre despedidas. **Exceção:** o ticket que já cumpria a regra havia mais de
  2 h (ex.: os parados quando a opção foi ligada) fecha **sem despedida**.
  Mandar dezenas de mensagens de uma vez, para quem sumiu há semanas, é o padrão
  que o WhatsApp bloqueia. O momento em que passou a cumprir a regra é o maior
  entre "abertura + X horas" e "última mensagem do cliente".
- **RN-AUTO-04 — Registro.** O fechamento fica no histórico do ticket sem
  usuário (`user_id` nulo) e sem "fechado por". Não concede XP de venda (isso é
  do fechamento manual). O front recebe `ticket:closed`.
- **RN-AUTO-05 — Várias réplicas.** O fechamento é um UPDATE condicional (só se
  o ticket ainda estiver aberto): com 2–3 réplicas da API rodando o job, só uma
  fecha o ticket e só ela manda a despedida. Cada ciclo fecha até 100 tickets,
  os mais antigos primeiro.

## Resposta por outro número

- **RN-AUTO-06 — Número do ticket caído ou removido.** Ao responder um ticket
  (atendente ou despedida), se a conexão do ticket não estiver conectada, a
  mensagem sai por **outra conexão conectada da mesma empresa** e o ticket passa
  para ela (`ticket:updated`). Prefere WhatsApp comum (bays/WuzAPI) à API
  oficial, que só aceita texto livre dentro da janela de 24 h. Decisão do
  negócio: o cliente pode receber de outro número, sem aviso ao atendente. Sem
  nenhuma conexão conectada, mantém a do ticket (falha como antes).
- **RN-AUTO-07 — "Conectada"** é o status atual da conexão (o mesmo que o card
  de Conexões mostra). Numa conexão WuzAPI que a WuzAPI não conhece (`401`, ex.:
  nunca pareada nela), o status é desconectado. Antes esse erro era ignorado e a
  conexão aparecia conectada para sempre.

## Pontos em aberto

- Bots e mensagens agendadas continuam saindo pela conexão de origem (o bot
  responde pela conexão em que a mensagem chegou, que está no ar por definição).
- O cliente que responde a um ticket com mais de X horas tem o ticket fechado
  no ciclo seguinte (com despedida), e a próxima mensagem dele abre outro ticket.
  É consequência direta da RN-AUTO-01.
