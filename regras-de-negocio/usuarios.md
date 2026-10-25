# Usuários

Gestão das pessoas da empresa pelo administrador: quem acessa o sistema, com
qual perfil e em quais filas e conexões atende. (Cada pessoa ajusta o
próprio apelido e foto em [meu-perfil.md](meu-perfil.md).)

**Rotas:** `/api/v1/configuracao/usuarios` — listar, `GET /selects` (filas e
conexões para escolher), criar, editar (`PUT /:id`) e excluir (`DELETE /:id`).

## Regras

- **RN-USR-01 — Acesso.** Só `admin`/`superAdmin`, e sempre sobre usuários da
  própria empresa. Usuário de outra empresa responde "não encontrado".
- **RN-USR-02 — Listagem.** Nome, apelido, e-mail, perfil, foto, se está
  aprovado, filas, conexões e a patente do jogo de conquistas (com o
  sub-nível de Mestre). Nunca inclui senha ou segredos de 2FA.
- **RN-USR-03 — Criação.** Nome, e-mail e senha obrigatórios. O usuário
  criado pelo admin já nasce aprovado e com e-mail verificado, e consegue
  entrar na hora. Sem perfil informado, vira atendente.
- **RN-USR-04 — E-mail.** Único no sistema inteiro (não só na empresa),
  guardado em minúsculas e sem espaços. Formato de e-mail válido.
- **RN-USR-05 — Senha.** No mínimo 8 caracteres (a mesma regra do cadastro
  público). Espaços nas pontas são removidos. Na edição, senha em branco
  significa "não trocar".
- **RN-USR-06 — Perfis.** O admin escolhe entre atendente e administrador.
  Ninguém cria nem promove um usuário a superAdmin por aqui.
- **RN-USR-07 — Filas e conexões.** Só da empresa (as de outra empresa são
  ignoradas). Enviadas na edição, substituem as atuais.
- **RN-USR-08 — Mudanças que derrubam a sessão.** Trocar a senha de alguém
  encerra todas as sessões dele (inclusive as "lembradas" por até 7 dias);
  trocar o perfil encerra as sessões para que ele entre de novo já com o
  perfil novo. Trocar nome, e-mail, filas ou conexões não derruba.
- **RN-USR-09 — Exclusão.** O admin não exclui a si mesmo. Excluir encerra na
  hora o acesso do usuário excluído. Tickets e mensagens dele continuam, sem o
  vínculo com a pessoa.
- **RN-USR-10 — Tudo ou nada.** Criação e edição gravam dados, filas e
  conexões juntos.

## Validações e mensagens

Erros trazem a mensagem em `message` (é o que a tela lê) e em `error`.

| Situação | Status | Mensagem |
|---|---|---|
| Criação sem nome, e-mail ou senha | 400 | `Nome, e-mail e senha são obrigatórios` |
| Edição com nome ou e-mail em branco | 400 | `Nome e e-mail são obrigatórios` |
| E-mail malformado | 400 | `E-mail inválido` |
| Senha com menos de 8 caracteres | 400 | `A senha deve ter no mínimo 8 caracteres` |
| Nome com mais de 200 caracteres | 400 | `O nome deve ter no máximo 200 caracteres` |
| Perfil que não existe | 400 | `Perfil inválido` |
| Filas/conexões que não são números | 400 | `queue_ids inválido` / `connection_ids inválido` |
| Admin excluindo a si mesmo | 400 | `Você não pode excluir seu próprio usuário` |
| Id com formato inválido | 400 | `id inválido` |
| Criar / promover a superAdmin | 403 | `Não é permitido criar superAdmin` / `Não é permitido definir superAdmin` |
| Usuário não existe ou é de outra empresa | 404 | `Usuário não encontrado` |
| E-mail já usado por outra conta | 409 | `E-mail já cadastrado` |

## Pontos em aberto

- **A empresa pode ficar sem administrador.** Um admin pode rebaixar a si
  mesmo para atendente (ou rebaixar os outros e depois a si). Falta uma regra
  de "ao menos um admin por empresa".
- **Usuário criado pelo admin não troca a senha no primeiro acesso.** O admin
  conhece a senha dele; não há "trocar senha no próximo login".
- **Aprovação**: usuários criados aqui já nascem aprovados; o campo
  `is_approved` aparece na lista mas não pode ser mudado por aqui.

## Mudanças na refatoração

- **A criação devolvia o hash da senha** (e os campos de 2FA) na resposta.
  Agora devolve só dados públicos.
- **A criação aceitava filas e conexões de outra empresa** (a edição já
  filtrava). Agora as duas filtram (RN-USR-07).
- **Excluir, trocar senha ou trocar perfil não derrubava a sessão**: o usuário
  excluído seguia usando o sistema até o token expirar, e o rebaixado mantinha
  os poderes de admin. Agora derruba na hora (RN-USR-08, RN-USR-09).
- **Senha mínima de 8 caracteres** passou a valer também para usuários
  criados pelo admin (antes qualquer senha não vazia era aceita).
- Trocar para um e-mail já usado dava `500`; agora `409`. E-mail malformado,
  perfil inexistente e ids inválidos davam `500` ou eram aceitos; agora `400`.
- A chave da sessão no Redis estava copiada no login e no middleware; agora é
  uma função só (`src/core/auth/session.ts`), usada também para derrubar sessões.
- A tela de Usuários passou a mostrar a mensagem da API ao editar (antes só
  "Erro ao atualizar usuário.").

## Código e testes

- `src/modules/usuarios/user-account-rules.ts` — nome, e-mail e senha.
- `src/modules/usuarios/usuario.service.ts` — perfis permitidos, unicidade de
  e-mail e quando derrubar sessões.
- `src/core/auth/password-hasher.ts` e `src/core/auth/session.ts` — hash de
  senha e sessões, para reuso no módulo de autenticação.
- `tests/modules/usuarios.test.ts` e `tests/unit/usuarios.test.ts`.
