# Notificações

Avisos para um usuário, mostrados no sino da barra lateral (presente em todas
as telas) e, se ele estiver com o sistema aberto, num aviso no canto da tela
na mesma hora.

**Rotas:** `GET /api/v1/notifications` (minhas notificações + não lidas),
`POST /api/v1/notifications/:id/read` e `POST /api/v1/notifications/read-all`.

## Regras

- **RN-NOT-01 — Pessoais.** Cada usuário vê e marca como lidas só as suas.
- **RN-NOT-02 — O sino.** Mostra as 50 mais recentes (não lidas destacadas) e
  o total de não lidas. Clicar numa notificação marca como lida e, se ela for
  de um atendimento, abre o chat desse ticket. "Marcar todas como lidas" zera
  o contador.
- **RN-NOT-03 — Aviso na hora.** Quando a notificação nasce, quem está com o
  sistema aberto vê um aviso por alguns segundos, com botão "Abrir". Esse
  aviso é melhor esforço; o sino também se atualiza a cada minuto e ao voltar
  para a aba, então nenhuma notificação se perde.
- **RN-NOT-04 — Tipos.** As notificações são genéricas (tipo, título, texto e
  contexto). Tipos atuais:

  | Tipo | Quando | Quem recebe |
  |---|---|---|
  | `scheduled_message_failed` | uma mensagem agendada não foi enviada | quem agendou + administradores da empresa |

- **RN-NOT-05 — Sem repetição.** Uma mesma notificação não chega duas vezes à
  mesma pessoa (ex.: quem agendou também é admin).

## Validações e mensagens

| Situação | Status | Mensagem |
|---|---|---|
| Id inválido | 400 | `id inválido` |
| Notificação não existe ou é de outra pessoa | 404 | `Notificação não encontrada` |
| Sem login | 401 | — |

## Pontos em aberto

- **Socket sem adaptador entre réplicas.** Em produção a API roda com 2–3
  instâncias e o socket de cada uma só alcança quem está conectado nela; por
  isso o aviso na hora pode não aparecer (RN-NOT-03). Resolve com o adaptador
  Redis do Socket.IO — vale para todos os eventos em tempo real do sistema.
- **Socket aceita entrar em qualquer sala.** `join:company`/`join:user` não
  conferem quem está pedindo: dá para ouvir eventos de outra empresa ou de
  outra pessoa. Precisa autenticar o socket (a tratar no módulo de socket).
- Notificações antigas não são apagadas automaticamente.
- O link para o ticket só abre se ele estiver na lista atual do chat; ticket
  finalizado mostra um aviso para procurar o contato.

## Código e testes

- `src/modules/notificacoes/notificacao.service.ts` — porta `Notifier` (usada
  por outros módulos para avisar usuários) e o sino.
- Front: `src/components/NotificationBell.tsx` (no rodapé da barra lateral).
- `tests/modules/notificacoes.test.ts` (inclui o aviso de falha de mensagem
  agendada chegando só a quem agendou e aos admins).
