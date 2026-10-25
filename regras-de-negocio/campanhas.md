# Campanhas (mensagens agendadas)

Disparos de uma mensagem para vários contatos numa data marcada, pelas
conexões de WhatsApp da empresa. Também guarda os "textos de agendamento":
mensagens prontas que a empresa cadastra e o atendente escolhe ao agendar uma
mensagem para um contato.

**Rotas:** `/api/v1/configuracao/mensagens-agendadas` — campanhas (listar,
criar, editar, excluir, `POST /:id/play`, `POST /:id/pause`), `GET /selects`
(conexões e contatos para escolher) e `/texts` (textos de agendamento).

**Arquitetura:** quem grava, agenda e dispara as campanhas é o microsserviço
`campaigns`. Esta API valida, restringe tudo à empresa de quem pede e
repassa. Os textos de agendamento e as opções do formulário ficam aqui.

## Regras

- **RN-CAM-01 — Acesso.** Só `admin`/`superAdmin`. Exceção: ler os textos de
  agendamento é liberado a qualquer usuário da empresa (RN-CAM-08).
- **RN-CAM-02 — Criação.** Título (até 200 caracteres), mensagem, data de
  envio válida e ao menos uma conexão da empresa. Opcionais: todos os
  contatos, contatos escolhidos, fuso horário e tipo.
- **RN-CAM-03 — Só recursos da empresa.** Conexões e contatos de outra
  empresa são descartados antes de chegar ao microsserviço. Se nenhuma conexão
  da empresa sobrar, a campanha é recusada.
- **RN-CAM-04 — Edição parcial.** Só os campos enviados são repassados.
- **RN-CAM-05 — Controle.** Excluir, iniciar e pausar valem só para campanhas
  da empresa; o microsserviço confere.
- **RN-CAM-06 — Falhas do microsserviço.** Campanha que não existe (ou é de
  outra empresa) → "Campanha não encontrada". Dados recusados por ele → a
  mensagem dele. Qualquer outra falha, ou sem resposta em 10 segundos →
  "Serviço de campanhas indisponível".
- **RN-CAM-07 — Opções do formulário.** Todas as conexões e todos os contatos
  da empresa.
- **RN-CAM-08 — Textos de agendamento.** Cada empresa cadastra os seus — não
  há textos padrão. Cada texto tem título (obrigatório, até 200 caracteres) e
  mensagem. O admin cadastra, edita e exclui; qualquer usuário da empresa lê.
  Aparecem na ordem de criação como botões de "Texto rápido" no modal
  "Agendar mensagem" do atendimento, e o atendente pode editar o texto antes
  de agendar. Sem textos cadastrados, o modal indica onde cadastrar.

## Validações e mensagens

Erros trazem a mensagem em `message` (é o que a tela lê) e em `error`.

| Situação | Status | Mensagem |
|---|---|---|
| Sem título / título com mais de 200 caracteres | 400 | `O título é obrigatório` / `O título deve ter no máximo 200 caracteres` |
| Sem mensagem | 400 | `A mensagem é obrigatória` |
| Sem data / data inválida | 400 | `A data de envio é obrigatória` / `A data de envio é inválida` |
| Nenhuma conexão (ou só de outra empresa) | 400 | `Selecione ao menos uma conexão` |
| Conexões/contatos que não são números | 400 | `connection_ids inválido` / `contact_ids inválido` |
| Microsserviço recusou os dados | 400 | a mensagem do microsserviço |
| Texto sem rótulo / rótulo com mais de 200 caracteres | 400 | `O rótulo é obrigatório` / `O rótulo deve ter no máximo 200 caracteres` |
| Id com formato inválido | 400 | `id inválido` |
| Campanha não encontrada | 404 | `Campanha não encontrada` |
| Texto não encontrado | 404 | `Texto não encontrado` |
| Microsserviço com falha ou sem resposta | 502 | `Serviço de campanhas indisponível. Tente novamente.` |

## Pontos em aberto

- **Migração órfã e índice que falta.** O arquivo
  `drizzle/0011_campanhas.sql` nunca foi aplicado (o registro de migrações
  aponta para outro 0011). Por isso a tabela de textos **não tem** o índice
  único "um texto por tipo por empresa". A API agora garante a regra sem o
  índice. Com a regra nova (RN-CAM-08) o índice deixou de ser necessário;
  recomendado só remover o arquivo órfão para não confundir.
- **Opções trazem todos os contatos da empresa** de uma vez; em bases grandes
  a tela fica pesada.

## Mudanças na refatoração

- **Textos padrão de farmácia removidos** (decisão de negócio): a API deixou de
  criar "Recorrência", "Pós-venda/Antibiótico", "Suplementação" e
  "Personalizar" para toda empresa. A migração
  `drizzle/0041_remove_pharmacy_default_texts.sql` apaga os que ainda estão
  exatamente como foram criados; textos editados pela empresa ficam.
- **A empresa cadastra os próprios textos** e eles **passaram a aparecer no
  modal do atendimento** — antes o modal mostrava três textos fixos no código
  do front e ignorava os da empresa.

- `POST /texts` (antes "criar/substituir por tipo", que respondia `500` em
  todo ambiente por depender do índice que não existe) agora cria um texto.
- **Edição dizia que deu certo mesmo quando não dava:** o `PUT` ignorava a
  resposta do microsserviço. Agora repassa o `404` e as falhas.
- **Falhas do microsserviço apareciam como "Campanha não encontrada"**
  (excluir/iniciar/pausar) ou como `500` genérico (listar/criar). Agora `502`
  com mensagem clara, e a mensagem de validação do microsserviço chega à tela
  (RN-CAM-06).
- **Chamadas sem prazo:** um microsserviço travado deixava a requisição
  pendurada; agora o limite é 10 segundos.
- Criar com todas as conexões de outra empresa chegava ao microsserviço sem
  conexão nenhuma; agora é recusado aqui (RN-CAM-03).
- Campos desconhecidos no corpo não são mais repassados ao microsserviço.
  Datas inválidas, títulos longos, tipos de texto inválidos e ids malformados
  dão `400`.

## Código e testes

- `src/modules/campanhas/campaigns.gateway.ts` — único ponto que fala com o
  microsserviço, com a tradução de erros.
- `src/modules/campanhas/campanha.service.ts` — `CampaignService` e
  `ScheduledTextService`.
- `src/modules/companies/company-directory.ts` — `CompanyResourceFilter`
  (conexões e contatos da empresa).
- `tests/modules/campanhas.test.ts` (com um microsserviço falso que registra as
  chamadas) e `tests/unit/campanhas.test.ts`.
