# Regras de negócio — API Kelmor

O que o sistema garante, módulo por módulo, escrito durante a refatoração para
OO/SOLID. Cada regra foi lida do código e tem teste que a protege.

## Como ler

- Cada regra tem um código (`RN-<MÓDULO>-<nº>`). Cite o código em PRs, issues e
  nomes de teste quando mexer na regra.
- **Pontos em aberto** são comportamentos que existem hoje mas que parecem
  acidentais ou não têm dono. Precisam de uma decisão de negócio antes de mudar.
- **Mudanças na refatoração** listam o que deixou de funcionar como antes, de
  propósito.

## Regras que valem para toda a API

- **RN-GERAL-01 — Isolamento por empresa.** Todo dado de empresa (produto,
  cupom, ticket…) só é visto e alterado por usuários da mesma empresa. Acessar
  um registro de outra empresa responde `404` (não `403`), para não revelar que
  ele existe.
- **RN-GERAL-02 — Perfis.** `user` (atendente), `admin` (dono/gestor da empresa)
  e `superAdmin` (operador da Kelmor, sem empresa). Rotas de configuração
  costumam ser só de `admin`/`superAdmin`.
- **RN-GERAL-03 — Erros.** Erros de regra respondem
  `{ "error": "<mensagem>", "message": "<mensagem>" }` (mesmo texto nos dois
  campos, porque partes do front leem um e partes leem o outro) com o status
  adequado (`400` entrada inválida, `403` sem permissão, `404` não encontrado,
  `409` conflito, `413` arquivo grande demais). O front exibe essa mensagem.
- **RN-GERAL-04 — Só os campos do contrato são gravados.** Campos que o
  endpoint não aceita são ignorados (nunca dá para alterar `id`, `company_id`,
  datas de criação etc. pelo corpo da requisição).

- **RN-GERAL-05 — Mídias enviadas.** Foto de perfil, anexos de mensagens
  rápidas, mídias e PIX dos bots e mídias recebidas pelo WhatsApp Oficial
  ficam no Cloudflare R2 (pasta `api/` do mesmo bucket da api-baileys) e são
  abertas pelo endereço público. Assim funcionam em qualquer instância da API
  e não somem nos deploys. Sem as variáveis `R2_*` (desenvolvimento, testes)
  ficam no disco local, servidas em `/uploads`. Upload de mídia de bot aceita
  só imagem, vídeo, áudio e PDF (nada de SVG/HTML, porque o arquivo é público).

## Módulos

| Módulo | Status | Documento |
|---|---|---|
| produtos | ✅ refatorado | [produtos.md](produtos.md) |
| cupons | ✅ refatorado | [cupons.md](cupons.md) |
| quick-messages | ✅ refatorado | [quick-messages.md](quick-messages.md) |
| integracoes | ✅ refatorado | [integracoes.md](integracoes.md) |
| agenda | ✅ refatorado | [agenda.md](agenda.md) |
| configuracao-geral | ✅ refatorado | [configuracao-geral.md](configuracao-geral.md) |
| meu-perfil | ✅ refatorado | [meu-perfil.md](meu-perfil.md) |
| achievements | ✅ refatorado | [achievements.md](achievements.md) |
| tarefas | ✅ refatorado | [tarefas.md](tarefas.md) |
| etiquetas | ✅ refatorado | [etiquetas.md](etiquetas.md) |
| pesquisas | ✅ refatorado | [pesquisas.md](pesquisas.md) |
| campanhas | ✅ refatorado | [campanhas.md](campanhas.md) |
| agendamento-mensagens | ✅ refatorado | [agendamento-mensagens.md](agendamento-mensagens.md) |
| api-messages | ✅ refatorado | [api-messages.md](api-messages.md) |
| usuarios | ✅ refatorado | [usuarios.md](usuarios.md) |
| auth | ✅ refatorado | [auth.md](auth.md) |
| superadmin | ✅ refatorado | [superadmin.md](superadmin.md) |
| filas | ✅ refatorado | [filas.md](filas.md) |
| bots | 🟡 cadastro refatorado (motor pendente) | [bots.md](bots.md) |
| crm | pendente | — |
| reports | pendente | — |
| monitoring | pendente | — |
| whatsapp-oficial | pendente | — |
| whatsapp | pendente | — |
| atendimento | pendente | — |
| notificacoes (novo) | ✅ criado | [notificacoes.md](notificacoes.md) |
