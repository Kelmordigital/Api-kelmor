# Tarefas (Central de Tarefas)

Quadro kanban **pessoal**: cada usuário organiza as próprias tarefas em
colunas, pode ligá-las a um contato e vê-las também dentro da conversa com
esse contato.

**Rotas:** `/api/v1/tarefas` — quadro (`GET /board`), arquivadas
(`GET /arquivadas`), tarefas de um contato (`GET /contato/:contactId`),
criar/editar/excluir tarefa, mover (`PATCH /:id/move`), concluir
(`PATCH /:id/concluir`), arquivar (`PATCH /:id/arquivar`) e colunas
(`/colunas`).

## Regras

- **RN-TAR-01 — Quadro pessoal.** Cada usuário tem o seu quadro. Todas as
  alterações (tarefas e colunas) valem só para o quadro de quem está logado;
  mexer em tarefa ou coluna de outra pessoa responde "não encontrada".
- **RN-TAR-02 — Admin vê o quadro dos outros (só leitura).** Admin e
  superAdmin podem abrir o quadro e as arquivadas de outro usuário **da mesma
  empresa** (`?owner_id=`). Atendente não. Não dá para alterar o quadro de
  outra pessoa.
- **RN-TAR-03 — Colunas fixas.** Todo quadro tem **Pilha de Ação** (entrada)
  e **Concluídas** (saída), criadas no primeiro acesso, uma única vez. Elas não
  podem ser renomeadas nem excluídas.
- **RN-TAR-04 — Colunas customizadas.** O usuário cria, renomeia e exclui as
  próprias colunas (título de até 100 caracteres). Elas aparecem entre as
  fixas, na ordem de criação. Excluir uma coluna devolve as tarefas dela para a
  Pilha de Ação.
- **RN-TAR-05 — Nova tarefa.** Título obrigatório (até 255 caracteres),
  descrição, prazo e contato opcionais. Entra **no topo** da Pilha de Ação, ou
  da coluna escolhida se ela for do quadro do usuário.
- **RN-TAR-06 — Contato da tarefa.** Só contatos da empresa podem ser
  ligados a uma tarefa. O quadro mostra nome, telefone e foto do contato.
- **RN-TAR-07 — Mover.** A tarefa vai para a coluna e posição pedidas (posição
  além do fim vai para o fim) e a coluna é reordenada.
- **RN-TAR-08 — Concluir é estar em Concluídas.** Mover para Concluídas marca
  a tarefa como concluída (guardando a data da primeira conclusão); tirar de
  lá reabre. "Concluir" leva para o topo de Concluídas; "reabrir", para o topo
  da Pilha de Ação.
- **RN-TAR-09 — Arquivar.** Tira a tarefa do quadro sem apagá-la; ela fica
  na lista de arquivadas (mais recentes primeiro) e pode ser desarquivada.
- **RN-TAR-10 — Tarefas na conversa.** Dentro da conversa com um contato, o
  usuário vê as **próprias** tarefas não arquivadas daquele contato, as
  abertas primeiro.
- **RN-TAR-11 — Atualização em tempo real.** Toda alteração avisa quem está
  com aquele quadro aberto.

## Validações e mensagens

| Situação | Status | Mensagem |
|---|---|---|
| Título da tarefa ausente ou em branco | 400 | `titulo é obrigatório` |
| Título com mais de 255 caracteres | 400 | `titulo deve ter no máximo 255 caracteres` |
| Prazo que não é data válida | 400 | `due_date inválido` |
| Contato de outra empresa (ou inexistente) | 400 | `Contato não encontrado` |
| Título da coluna ausente / > 100 caracteres | 400 | `title é obrigatório` / `title deve ter no máximo 100 caracteres` |
| Mover sem coluna / com posição negativa | 400 | `column_id é obrigatório` / `index inválido` |
| "Concluir"/"arquivar" com valor que não é sim/não | 400 | `done inválido` / `archived inválido` |
| Id, contato ou dono com formato inválido | 400 | `id inválido` / `contactId inválido` / `owner_id inválido` |
| Atendente abrindo quadro de outra pessoa | 403 | `Apenas administradores podem ver o quadro de outros usuários.` |
| Usuário sem empresa (superAdmin) | 403 | `Empresa não encontrada` |
| Dono do quadro não é da empresa | 404 | `Usuário não encontrado` |
| Tarefa não existe ou é de outro quadro | 404 | `Tarefa não encontrada` |
| Mover para tarefa/coluna inexistente ou de outro quadro | 404 | `Tarefa ou coluna não encontrada` |
| Renomear coluna fixa ou de outro quadro | 404 | `Coluna não encontrada` |
| Excluir coluna fixa ou de outro quadro | 404 | `Coluna não encontrada ou não pode ser excluída` |

## Pontos em aberto

- **Gestor não atribui tarefas.** O quadro é estritamente pessoal: o admin
  vê, mas não cria tarefa para um atendente.
- **Prazo não avisa ninguém.** O prazo é só informativo; não há lembrete nem
  destaque de atrasadas do lado da API.
- **Tarefas antigas com contato de outra empresa.** Se alguma tarefa já foi
  ligada a um contato de outra empresa (era possível antes da refatoração), o
  quadro agora mostra essa tarefa sem contato. Vale uma consulta no banco de
  produção para limpar esses vínculos.

## Mudanças na refatoração

- **Vazamento entre empresas corrigido:** era possível ligar uma tarefa ao
  contato de outra empresa e ver nome, telefone e foto dele no quadro. Agora o
  contato é conferido e o quadro só exibe contatos da própria empresa
  (RN-TAR-06).
- Admin abrindo o quadro de um id qualquer criava colunas para um usuário
  inexistente; agora responde `404`. Id malformado dava `500`; agora `400`
  (RN-TAR-02).
- Dois primeiros acessos simultâneos podiam criar as colunas fixas em dobro;
  agora a criação é serializada por quadro (RN-TAR-03).
- `done: "false"` (texto) **concluía** a tarefa; agora é recusado.
- Prazo inválido, títulos longos demais, posição negativa e contato com
  número quebrado davam `500` ou eram aceitos; agora `400`. A edição também
  recusa título em branco.

## Código e testes

- `src/modules/tarefas/task-board.ts` — regras do quadro (colunas fixas,
  ordem, posições, conclusão), sem banco.
- `src/modules/tarefas/tarefas.service.ts` — quem pode ver/alterar o quê.
- `src/modules/companies/company-directory.ts` — conferência "é desta
  empresa?" para usuários e contatos, reutilizável pelos próximos módulos.
- `tests/modules/tarefas.test.ts` (API) e `tests/unit/tarefas.test.ts`.
