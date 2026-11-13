# Painel do superAdmin

Painel do operador da Kelmor (o superAdmin, sem empresa): cadastrar empresas
clientes, ativar/desativar, aprovar ou bloquear o acesso dos admins e ver os
números gerais.

**Rotas** (`/api/v1/superadmin`, todas só para o superAdmin): `GET /stats`,
`GET /companies`, `POST /companies`, `PATCH /companies/:id`,
`PATCH /companies/:id/status`, `PATCH /users/:id/approve`,
`PATCH /users/:id/revoke`, `GET /metrics/history` (métricas do servidor, do
módulo monitoring).

## Regras

- **RN-SUP-01 — Acesso exclusivo.** Sem login → `401`; qualquer perfil que não
  seja superAdmin → `403`.
- **RN-SUP-02 — Números do painel.** Total de empresas, ativas, inativas
  (total = ativas + inativas) e pendentes = usuários de perfil admin ainda não
  aprovados.
- **RN-SUP-03 — Lista de empresas.** Mais recentes primeiro, cada uma com a
  equipe inteira (admins primeiro, depois por antiguidade), a quantidade de
  usuários e "o admin" — o usuário de perfil admin mais antigo da empresa.
  A situação mostrada é:
  - `INATIVA` se a empresa está desativada (vence as outras);
  - `PENDENTE` se está ativa mas o admin principal ainda não foi aprovado;
  - `ATIVA` nos demais casos (inclusive empresa sem admin).
- **RN-SUP-04 — Cadastro de empresa.** Cria juntos (ou nenhum dos dois) a
  empresa, já ativa, e o seu admin: nome da empresa (2+ caracteres, espaços nas
  pontas removidos), CNPJ/CPF opcional (até 20), nome do admin (2+), e-mail
  único sem diferenciar maiúsculas (guardado em minúsculas) e senha de 8+
  caracteres. O admin nasce com e-mail verificado, acesso ao financeiro e
  **aguardando aprovação** — só entra depois que o superAdmin aprovar.
- **RN-SUP-05 — Ativar/desativar empresa.** Empresa desativada não entra: o
  login de qualquer usuário dela responde `Empresa inativa`, e quem estava
  logado perde a sessão **na hora**. Ela também para os envios automáticos:
  - mensagens agendadas que vencerem viram falha (RN-AGM-11);
  - campanhas ativas são pausadas (RN-CAM-09);
  - a API de mensagens recusa envios (RN-API-10);
  - os bots não respondem.

  As conexões de WhatsApp continuam conectadas e as mensagens recebidas
  continuam entrando nos atendimentos. Reativar libera os logins, os bots, a
  API e os novos agendamentos sem precisar ler QR code; campanhas pausadas
  voltam só com play do admin. Se uma dessas reações falhar (ex.: serviço de
  campanhas fora do ar), a empresa fica desativada mesmo assim e a falha vai
  para o log do servidor.
- **RN-SUP-06 — Aprovar/revogar acesso.** Aprovar libera o login de uma conta.
  Revogar bloqueia o login (`Sua conta está aguardando aprovação.`) e encerra
  na hora a sessão aberta. O superAdmin não pode revogar a si mesmo.
- **RN-SUP-07 — Edição de empresa.** Só nome e CNPJ/CPF, com as mesmas regras
  do cadastro.

## Validações e mensagens

Erros saem como `{ "statusCode", "error", "message" }`; a tela do painel
mostra o `message`.

| Situação | Status | `message` |
|---|---|---|
| Não é superAdmin | 403 | `Acesso exclusivo para o administrador do sistema.` |
| Nome da empresa curto | 400 | `Nome da empresa deve ter ao menos 2 caracteres` |
| CNPJ/CPF longo | 400 | `CNPJ/CPF deve ter no máximo 20 caracteres` |
| Sem dados do admin | 400 | `Dados do admin são obrigatórios` |
| Nome do admin curto | 400 | `Nome do admin deve ter ao menos 2 caracteres` |
| E-mail do admin inválido | 400 | `E-mail do admin inválido` |
| Senha do admin curta | 400 | `Senha do admin deve ter ao menos 8 caracteres` |
| E-mail já cadastrado | 409 | `Email já cadastrado` |
| `status` não booleano | 400 | `status deve ser verdadeiro ou falso` |
| Id malformado na URL | 400 | `id inválido` |
| Empresa não existe | 404 | `Empresa não encontrada` |
| Usuário não existe | 404 | `Usuário não encontrado` |
| Revogar a si mesmo | 400 | `O superAdmin não pode revogar a própria aprovação.` |

## Pontos em aberto

- As outras mensagens automáticas (encerramento do ticket, saudação da fila,
  pesquisa de satisfação) não conferem a empresa: elas só saem por ação de
  alguém logado ou do bot, e os dois já ficam bloqueados. Se surgir um envio
  automático novo, ele precisa conferir a empresa (`CompanyStatusReader`).
- Falha ao pausar campanhas na desativação só aparece no log; o superAdmin não
  é avisado na tela.
- **"Pendentes" conta todo admin não aprovado**, inclusive admins extras
  criados dentro de uma empresa já ativa — o número pode não bater com as
  empresas `PENDENTE` da lista.
- O admin criado não recebe nenhum aviso (e-mail com acesso); o superAdmin
  precisa passar a senha por fora.
- Não existe excluir empresa — só desativar.

## Mudanças na refatoração

- **Desativar a empresa não parava nada além do login** (decisão de negócio):
  agora para agendadas, campanhas, API de mensagens e bots, mantendo o
  WhatsApp conectado (RN-SUP-05).

- **Revogar o acesso e desativar a empresa não derrubavam quem já estava
  logado**: a pessoa continuava usando o sistema por até 15 min (até o token
  vencer). Agora a sessão acaba na hora (RN-SUP-05, RN-SUP-06).
- **E-mail do admin com maiúsculas** (`Ana@Loja.com`) passava pela checagem de
  duplicado e era guardado como veio, embora o login ignore maiúsculas. Agora é
  guardado em minúsculas e o duplicado é recusado (RN-SUP-04). E-mail com
  espaços nas pontas era recusado; agora é aceito sem os espaços.
- Dois cadastros simultâneos com o mesmo e-mail davam `500`; agora `409`.
- Id malformado na URL dava `500`; agora `400 id inválido`.
- Dados inválidos respondiam `Validation Error` sem `message`, e a tela
  mostrava um erro genérico; agora a mensagem diz o que está errado.
- Nome da empresa só com espaços era aceito; na edição bastava 1 caractere.
  Agora vale a regra do cadastro (2+, sem os espaços das pontas).

## Código e testes

- `src/modules/superadmin/company-panel.ts` — RN-SUP-03 (admin principal,
  equipe, situação).
- `src/modules/superadmin/superadmin.service.ts` — RN-SUP-02, 04 a 07;
  `CompanySessionsShutdown` e as reações à desativação.
- `src/modules/companies/company-status.ts` — "empresa ativa?" e o contrato
  das reações à desativação; `src/modules/campanhas/active-campaigns-pauser.ts`.
- `src/modules/superadmin/superadmin.dto.ts` — validações.
- `tests/modules/superadmin.test.ts`, `tests/modules/superadmin-contrato.test.ts`,
  `tests/modules/superadmin-lock.test.ts` e `tests/unit/superadmin.test.ts`.
