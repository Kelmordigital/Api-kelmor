# Autenticação

Entrar, manter a sessão, sair, verificação em duas etapas (2FA) e criação de
contas pela chave de administração do sistema.

**Rotas** (`/api/v1/auth`): `POST /login`, `POST /login/totp`,
`POST /refresh`, `DELETE /logout`, `GET /me`, `POST /register` (chave de
administração), `PATCH /approve/:id` (superAdmin), `GET /totp/setup`,
`POST /totp/enable`, `POST /totp/disable` (superAdmin).

## Regras

- **RN-AUT-01 — Login.** E-mail (sem diferenciar maiúsculas, espaços nas
  pontas ignorados) e senha. E-mail inexistente e senha errada recebem a
  mesma resposta e levam o mesmo tempo — não dá para descobrir quem tem conta.
- **RN-AUT-02 — Conta liberada.** Para ter sessão, nesta ordem: e-mail
  verificado, conta aprovada e — exceto o superAdmin — empresa vinculada e
  ativa. Vale no login e em toda renovação: se a empresa for desativada, a
  sessão de quem já estava logado acaba na próxima renovação.
- **RN-AUT-03 — Sessão.** O login devolve um token de acesso (15 min) e grava
  um token de renovação num cookie protegido (7 dias). A sessão também fica
  registrada no servidor: sem esse registro, o token de acesso para de valer
  na hora.
- **RN-AUT-04 — Renovação.** Troca o token de renovação por um novo (o antigo
  deixa de valer) e emite outro token de acesso. O front faz isso sozinho
  quando o acesso expira.
- **RN-AUT-05 — Logout.** Apaga o token de renovação e encerra a sessão no
  servidor: o token de acesso em uso deixa de valer na hora. Se a pessoa
  estava logada em outro aparelho, esse aparelho renova sozinho e continua.
- **RN-AUT-06 — Verificação em duas etapas (2FA).** Hoje disponível só para o
  superAdmin. Ativar: gerar um QR (vale 10 min) e confirmar com um código do
  app; são entregues 10 códigos de recuperação, mostrados uma única vez.
  Com 2FA ativo, a senha certa devolve um "ticket" (5 min, uso único) e a
  sessão só é emitida com o código do app ou um código de recuperação (cada
  um vale uma vez). Desativar exige um código do app.
- **RN-AUT-07 — Proteção contra força bruta.** No máximo 5 tentativas por
  minuto por IP no login, no passo do 2FA e na ativação/desativação do 2FA.
- **RN-AUT-08 — Cadastro pela chave do sistema.** Só com a chave de
  administração (`x-admin-key`). Nome (2+ caracteres), e-mail único (guardado
  em minúsculas), senha de 8+ caracteres, perfil e empresa opcional (que
  precisa existir). Nunca cria superAdmin — só existe um, criado na
  instalação. A conta nasce aguardando aprovação.
- **RN-AUT-09 — Aprovação.** O superAdmin aprova contas pendentes.
- **RN-AUT-10 — Meus dados.** `GET /me` traz o perfil e quantas filas e
  conexões a pessoa tem (o front avisa quem não recebe atendimentos).

## Validações e mensagens

Erros saem como `{ "statusCode", "error", "message" }` — formato mantido por
compatibilidade com o front, o app desktop e as integrações.

| Situação | Status | `message` |
|---|---|---|
| E-mail ou senha errados | 401 | `Usuário ou senha inválido` |
| E-mail não verificado | 403 | `Email não verificado` |
| Conta não aprovada | 403 | `Sua conta está aguardando aprovação.` |
| Usuário sem empresa | 403 | `Sua conta está indisponível no momento. Entre em contato com o financeiro.` |
| Empresa inativa | 403 | `Empresa inativa` |
| Ticket do 2FA inválido, vencido ou já usado | 401 | `Sessão de verificação inválida ou expirada. Faça login novamente.` |
| Código do 2FA errado | 401 (login) / 400 (ativar/desativar) | `Código inválido` |
| 2FA indisponível (Redis fora) | 503 | `Verificação em duas etapas indisponível no momento.` |
| QR do 2FA vencido | 400 | `Configuração expirada. Gere um novo QR code.` |
| Desativar 2FA que não está ativo | 400 | `Verificação em duas etapas não está ativa.` |
| Renovação sem cookie / inválida / revogada | 401 | `Refresh token não fornecido` / `Refresh token inválido ou expirado` / `Refresh token revogado` |
| Renovação de conta bloqueada (RN-AUT-02) | 401 | `Sessão encerrada. Faça login novamente.` |
| Cadastro: superAdmin / empresa inexistente | 400 | `Não é permitido criar usuários superAdmin` / `Empresa não encontrada` |
| Cadastro: e-mail já usado | 409 | `Email já cadastrado` |
| Dados em formato inválido | 400 | `Validation Error` com os campos |

## Pontos em aberto

- **2FA só para o superAdmin.** Admins e atendentes não conseguem ativar.
- **Token de renovação roubado e reutilizado** não derruba as outras sessões
  (só é recusado). Dá para detectar reuso e encerrar tudo.
- **Logout encerra a sessão do servidor para todos os aparelhos** da pessoa;
  os outros renovam sozinhos, mas por um instante recebem 401.
- Não há "esqueci minha senha" nem troca de senha pelo próprio usuário.

## Mudanças na refatoração

- **Logout não encerrava a sessão**: o token de acesso continuava valendo
  até 15 min depois de sair. Agora deixa de valer na hora (RN-AUT-05).
- **E-mail com maiúsculas não entrava** (`Ana@Empresa.com`), e o cadastro
  guardava o e-mail como veio. Agora login e cadastro ignoram maiúsculas e o
  e-mail é guardado em minúsculas (RN-AUT-01, RN-AUT-08).
- Cadastro com empresa inexistente dava `500`; agora `400`.
- "Usuário não existe" respondia mais rápido que "senha errada", o que
  permitia descobrir e-mails cadastrados pelo tempo de resposta. Agora levam o
  mesmo tempo.
- As regras de conta liberada estavam copiadas no login e na renovação; agora
  são uma só (`AccountStatusPolicy`).

## Código e testes

- `src/modules/auth/account-status-policy.ts` — RN-AUT-02.
- `src/modules/auth/auth.service.ts` — `AuthenticationService` (login,
  renovação, logout) e `AccountService` (cadastro, aprovação).
- `src/modules/auth/two-factor.service.ts` — 2FA.
- `src/core/auth/session.ts` — sessão no servidor (abrir/encerrar).
- `tests/modules/auth.test.ts`, `tests/modules/totp.test.ts`,
  `tests/modules/auth-sessao.test.ts` e `tests/unit/auth.test.ts`.
