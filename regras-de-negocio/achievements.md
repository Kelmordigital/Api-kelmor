# Conquistas (gamificação)

A "experiência gamer": um mapa de missões de configuração inicial, patentes
que sobem com as missões, sub-níveis por atendimentos fechados e XP por venda.

**Rotas:** `/api/v1/achievements` — `GET /progress` (meu progresso),
`POST /complete` (concluir missão: `{ "mission_key": "..." }`). A tela de
Usuários também mostra o progresso de cada pessoa da empresa.

## Regras

- **RN-CON-01 — Chave-mestra por empresa.** A gamificação vem ligada; o admin
  pode desligar em Configurações gerais (`gamification_enabled`). Desligada,
  ver o próprio progresso e concluir missões são recusados.
- **RN-CON-02 — Progresso é do próprio usuário.** Cada pessoa vê o seu.
  Qualquer perfil vê (o atendente precisa da barra de XP no atendimento).
  Quem não tem empresa (superAdmin) não tem conquistas.
- **RN-CON-03 — Missões.** Seis missões fixas:

  | Chave | Missão |
  |---|---|
  | `conectar_whatsapp` | conectar o WhatsApp |
  | `criar_fila` | criar uma fila |
  | `criar_etiqueta` | criar uma etiqueta |
  | `criar_mensagem_rapida` | criar uma mensagem rápida |
  | `enviar_primeira_mensagem` | enviar a primeira mensagem |
  | `agendar_mensagem` | agendar uma mensagem |

  Título, ícone e tela de cada missão ficam no front; a API só conhece a chave.
- **RN-CON-04 — Concluir missão: só admin.** Só `admin`/`superAdmin` marcam
  missão como concluída (é quem acessa o Mapa de Conquistas). Concluir de novo
  não duplica nem dá erro.
- **RN-CON-05 — Patente pelas missões.**

  | Missões concluídas | Patente |
  |---|---|
  | 0–1 | Aprendiz |
  | 2–3 | Explorador |
  | 4–5 | Aventureiro |
  | 6 | Mestre |

- **RN-CON-06 — Sub-nível de Mestre.** Só na patente Mestre: começa em
  Mestre I e sobe um nível a cada 10 atendimentos fechados pelo usuário
  (10 → II, 20 → III…). Contam só tickets **fechados por ele** na empresa.
- **RN-CON-07 — XP.** O progresso mostra o XP acumulado do usuário. O XP é
  ganho ao fechar atendimento como venda (valor configurável em Configurações
  gerais, `sale_xp_amount`) — regra do módulo de atendimento.
- **RN-CON-08 — Visão da empresa.** A tela de Usuários mostra missões,
  patente, sub-nível e XP de cada pessoa, mesmo com a gamificação desligada.

## Validações e mensagens

| Situação | Status | Mensagem |
|---|---|---|
| `mission_key` ausente, vazia ou que não é texto | 400 | `Campo "mission_key" é obrigatório` |
| Missão fora do catálogo | 400 | `Chave de missão desconhecida: <chave>` |
| Gamificação desligada na empresa | 403 | `A experiência gamer (Conquistas/XP) está desativada para esta empresa.` |
| Atendente tentando concluir missão | 403 | `Acesso exclusivo para administradores.` |
| Usuário sem empresa (superAdmin) | 403 | `Empresa não encontrada` |

## Pontos em aberto

- **Missões são declaradas pelo front.** A API não confere se a ação
  aconteceu (ex.: se uma fila foi mesmo criada); basta o front mandar a
  chave. Um admin pode concluir todas as missões sem fazer nada.
- **Só o admin evolui nas missões.** Como só admin conclui missões, o
  atendente nunca passa de Aprendiz e nunca chega aos sub-níveis de Mestre,
  embora veja a barra de progresso.
- **A tela de Usuários mostra progresso com a gamificação desligada**
  (RN-CON-08). Confirmar se é o desejado.

## Mudanças na refatoração

- Progresso pedido pelo superAdmin dava `500`; agora `403`.
- `mission_key` que não é texto agora responde "obrigatório" em vez de
  "chave desconhecida: 42".
- O cálculo de patente/sub-nível, que estava duplicado em dois lugares, virou
  uma regra só (`Ranking`). Mudar patentes ou o ritmo dos sub-níveis é trocar
  a tabela de regras, sem mexer no cálculo.

## Código e testes

- `src/modules/achievements/achievements.rules.ts` — catálogo de missões,
  patentes, sub-níveis (`Ranking`) e erros.
- `src/modules/achievements/achievements.service.ts` — chave-mestra e porta
  `AchievementProgressReader` usada pela tela de Usuários.
- `tests/modules/achievements.test.ts` (jogo completo, de Aprendiz a Mestre II),
  `tests/modules/achievements-access.test.ts` e
  `tests/unit/achievements.ranking.test.ts`.
