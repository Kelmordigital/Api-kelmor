# Pesquisas de satisfação

Perguntas de múltipla escolha enviadas ao cliente pelo WhatsApp no
encerramento do atendimento ("Como foi seu atendimento? 1. Ótimo 2. Bom…"),
com relatório das respostas.

**Rotas:** `/api/v1/configuracao/pesquisas` — listar, `GET /active`, criar,
editar, excluir, `GET /report` (resultados) e `GET /report/view` (tickets de
uma resposta). O envio e a captura da resposta acontecem dentro do fluxo de
fechamento do ticket e das mensagens recebidas do WhatsApp.

## Regras

- **RN-PES-01 — Acesso.** Cadastro e relatório são só de `admin`/`superAdmin`.
- **RN-PES-02 — Cadastro.** Nome obrigatório e ao menos uma opção de
  resposta (cada opção com até 200 caracteres, sem opção em branco). Padrões:
  tipo "satisfação", ativa, não é a pesquisa padrão.
- **RN-PES-03 — Pesquisa padrão.** No máximo uma pesquisa padrão por empresa:
  marcar uma desmarca as outras. Hoje é só uma indicação na tela, sem efeito
  no fluxo.
- **RN-PES-04 — Filas.** Uma pesquisa é ligada a filas **da empresa** (filas
  de outra empresa são ignoradas). É a fila do ticket que decide se o
  atendente pode encerrar "com pesquisa".
- **RN-PES-05 — Qual pesquisa vale para a fila.** A pesquisa **ativa** da
  empresa ligada à fila. Se houver mais de uma ativa, vale a criada por último.
  Pesquisas inativas nunca valem.
- **RN-PES-06 — Edição parcial.** Campos não enviados não mudam. Opções e
  filas enviadas substituem as atuais. Opções que continuam com o mesmo texto
  são mantidas, junto com o histórico de respostas delas.
- **RN-PES-07 — Ordem das opções.** As opções são numeradas na ordem em que
  foram criadas; novas opções vão para o fim.
- **RN-PES-08 — Encerramento com pesquisa.** Em vez da mensagem de despedida,
  o cliente recebe o nome da pesquisa e as opções numeradas, e o ticket fica
  aguardando a resposta. Se a pesquisa não tem opções ou o contato não tem
  número/LID, nada é enviado.
- **RN-PES-09 — Resposta do cliente.** A mensagem seguinte do cliente responde
  a pesquisa pendente mais recente dele, se for o **número** de uma opção ou o
  **texto exato** de uma (sem diferenciar maiúsculas). Respondida, o ticket é
  fechado de vez (com o XP de venda, se houver). Qualquer outra mensagem segue
  como mensagem normal do atendimento e a pesquisa continua pendente.
- **RN-PES-10 — Relatório.** Por pesquisa: total de respostas e, por opção,
  quantidade e percentual (arredondado). Filtros: período (pela data da
  resposta, dia final inclusivo) e atendente do ticket. Traz também a lista de
  usuários aprovados da empresa para o filtro. O detalhe de uma opção lista os
  tickets que a escolheram (50 por página), do mais recente ao mais antigo.

## Validações e mensagens

Erros trazem a mensagem em `message` (é o que a tela lê) e em `error`.

| Situação | Status | Mensagem |
|---|---|---|
| Nome ausente ou em branco | 400 | `O nome da pesquisa é obrigatório` |
| Nenhuma opção de resposta | 400 | `Adicione ao menos uma opção de resposta` |
| Opção em branco | 400 | `As opções de resposta não podem ficar em branco` |
| Opção com mais de 200 caracteres | 400 | `Cada opção deve ter no máximo 200 caracteres` |
| Filas que não são números | 400 | `queue_ids inválido` |
| Detalhe sem opção / opção inválida | 400 | `answerId obrigatório` / `answerId inválido` |
| Período fora do formato AAAA-MM-DD | 400 | `dateInit inválido` / `dateEnd inválido` |
| Id com formato inválido | 400 | `id inválido` |
| Pesquisa não existe ou é de outra empresa | 404 | `Pesquisa não encontrada` |

## Pontos em aberto

- **Pesquisa pendente nunca expira.** Se o cliente não responder, a
  pesquisa fica pendente; se ele responder dias depois "1" num novo assunto, a
  mensagem é capturada como resposta. Falta um prazo de validade.
- **Reordenar opções não tem efeito** nas que já existiam (RN-PES-07); seria
  preciso guardar a posição de cada opção.
- **Corrigir o texto de uma opção perde o histórico dela**, porque a opção
  editada conta como nova (RN-PES-06).
- **"Pesquisa padrão" não faz nada** além do selo na tela (RN-PES-03).
- Os parâmetros `limit`/`offset` do relatório geral são ignorados (ele não
  pagina).

## Mudanças na refatoração

- **Editar pesquisa de outra empresa:** o `PUT` não conferia a empresa antes
  de apagar e substituir opções e filas — um admin podia apagar as opções da
  pesquisa de outra empresa sabendo o id. Agora responde `404` sem mexer em
  nada.
- **Fila de outra empresa:** era possível ligar uma pesquisa à fila de outra
  empresa e, com isso, desligar a pesquisa dela. Agora só filas da empresa
  entram e a busca filtra a empresa (RN-PES-04, RN-PES-05).
- **Pesquisa ativa ignorada:** com mais de uma pesquisa na fila, a busca
  pegava um vínculo qualquer e podia cair numa inativa. Corrigido (RN-PES-05).
- **Editar opções apagava o histórico** de todas as respostas. Agora só das
  opções removidas (RN-PES-06).
- **Numeração das opções** passou a ter ordem definida, igual na pergunta e na
  leitura da resposta (RN-PES-07) — antes "2" podia ser lido como outra opção.
- Criação e edição viraram transações. Opções em branco/longas, filas
  inválidas, datas e ids malformados davam `500` ou eram aceitos; agora `400`.

## Código e testes

- `src/modules/pesquisas/survey-question.ts` — pergunta, leitura da resposta e
  troca de opções sem perder histórico.
- `src/modules/pesquisas/pesquisa.service.ts` — `ResearchCatalogService`
  (cadastro), `SurveyFlowService` (porta `ResearchSurvey`, usada pelo
  atendimento e pelos webhooks do WhatsApp) e `ResearchReportService`.
- `tests/modules/pesquisas.test.ts` e `tests/unit/pesquisas.test.ts`.
