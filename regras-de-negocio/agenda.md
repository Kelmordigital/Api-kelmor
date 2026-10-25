# Agenda

Agendamentos da empresa (visitas, reuniões, retornos), exibidos num
calendário mensal e espelhados no Google Agenda quando a empresa está
conectada (ver [integracoes.md](integracoes.md)).

**Rotas:** `/api/v1/agenda` — listar (`GET ?start=&end=`), criar (`POST`),
editar (`PUT /:id`), remover (`DELETE /:id`). O front hoje só lista e cria;
editar e remover existem apenas na API.

## Regras

- **RN-AGE-01 — Acesso.** Só `admin`/`superAdmin` de uma empresa. O
  superAdmin, que não pertence a uma empresa, não tem agenda.
- **RN-AGE-02 — Título obrigatório.** Espaços nas pontas são removidos; título
  vazio é recusado ao criar e ao editar.
- **RN-AGE-03 — Início e fim obrigatórios.** Todo agendamento tem data/hora de
  início e de término.
- **RN-AGE-04 — Término não antes do início.** Início e término iguais são
  permitidos. Na edição, a regra vale para o resultado final: mudar só o
  início para depois do término salvo é recusado.
- **RN-AGE-05 — Autor.** Quem cria fica registrado como autor do agendamento;
  isso não muda depois.
- **RN-AGE-06 — Padrões.** Cor `#6366f1`, "avisar ao criar" ligado, lembrete
  na hora exata desligado, sem minutos de lembrete, sem grupos e sem lead.
- **RN-AGE-07 — Lead e grupos.** Um agendamento pode ser ligado a um lead do
  CRM e a grupos (filas) que devem ser avisados.
- **RN-AGE-08 — Edição parcial.** Só os campos enviados mudam. Empresa, autor e
  o vínculo com o Google nunca mudam pela edição.
- **RN-AGE-09 — Listagem por período.** Lista os agendamentos que **começam**
  dentro do período (limites inclusivos), do mais cedo para o mais tarde. Sem
  período informado, vale o mês corrente inteiro, até o último segundo do
  último dia.
- **RN-AGE-10 — Espelho no Google Agenda.** Com a empresa conectada, criar
  um agendamento cria o evento no Google; editar ou remover um agendamento
  já espelhado faz o mesmo no Google. Falha no Google nunca impede a operação
  na agenda (RN-INT-10).
- **RN-AGE-11 — Só o que foi espelhado é atualizado.** Agendamentos criados
  sem integração (ou com ela precisando reconectar) ficam só no sistema;
  conectar depois não os envia ao Google.

## Validações e mensagens

| Situação | Status | Mensagem |
|---|---|---|
| Título ausente ou em branco | 400 | `title é obrigatório` |
| Início ou término ausente (criação) | 400 | `start_at e end_at são obrigatórios` |
| Data/hora que não é válida | 400 | `start_at inválido` / `end_at inválido` |
| Término antes do início | 400 | `end_at não pode ser antes de start_at` |
| Cor com mais de 20 caracteres | 400 | `color inválida` |
| Lead com mais de 100 caracteres | 400 | `lead_id inválido` |
| Minutos de lembrete negativos ou fracionados | 400 | `reminder_minutes inválido` |
| Grupos que não são números | 400 | `notify_groups inválido` |
| Período da listagem inválido | 400 | `start inválido` / `end inválido` |
| Id com formato inválido | 400 | `id inválido` |
| Usuário sem empresa (superAdmin) | 403 | `Empresa não encontrada` |
| Agendamento não existe ou é de outra empresa | 404 | `Agendamento não encontrado` |

## Pontos em aberto

- **Avisos e lembretes não existem.** "Avisar ao criar", minutos de lembrete,
  "lembrar na hora exata" e grupos a avisar são gravados, mas nenhuma parte do
  sistema lê esses campos: ninguém é avisado. Falta decidir como o aviso
  chega (WhatsApp para a fila? notificação no sistema?) e implementar.
- **Lead e grupos não são conferidos.** Dá para gravar um lead ou uma fila que
  não existe ou que é de outra empresa.
- **Sem tela para editar ou remover** agendamentos no front.
- **Fuso horário do período padrão.** Sem período informado, "mês corrente" é
  calculado no fuso do servidor, não no da empresa. O front sempre informa o
  período, então hoje não afeta a tela.
- Agendamentos que começam antes do período e terminam dentro dele não
  aparecem na listagem (ela olha só o início).

## Mudanças na refatoração

- Sem período informado, os agendamentos do **último dia do mês** não
  apareciam (o período terminava à meia-noite desse dia). Corrigido (RN-AGE-09).
- Datas inválidas, cor longa demais e período inválido respondiam `500`;
  agora respondem `400` com a mensagem acima.
- Era possível gravar término antes do início e, na edição, título vazio ou
  com espaços. Agora são recusados (RN-AGE-02, RN-AGE-04). O formulário do
  front também avisa "O término não pode ser antes do início".
- A listagem passou a vir ordenada pelo início.
- Se a renovação do token do Google falhasse, criar ou editar respondia `500`
  mesmo com o agendamento gravado (corrigido junto com
  [integracoes](integracoes.md)).

## Código e testes

- `src/modules/agenda/agenda.service.ts` — regras e espelho no calendário (via
  a porta `CalendarSync`, sem conhecer o Google).
- `src/modules/agenda/agenda-period.ts` — período padrão da listagem.
- `tests/modules/agenda.test.ts` (API) e `tests/unit/agenda.service.test.ts`
  (regras e sincronização com calendário simulado).
