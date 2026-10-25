# Meu perfil

O que cada usuário vê e ajusta sobre si mesmo: dados básicos, apelido, modo
"esconder meu nome", foto e, para administradores, as próprias filas e
conexões.

**Rotas:** `/api/v1/configuracao/meu-perfil` — `GET /` (meus dados),
`GET /selects` (filas e conexões para escolher), `PUT /` (editar),
`POST /avatar` (foto, multipart com o campo `file`).

## Regras

- **RN-PER-01 — Sempre o próprio usuário.** As rotas nunca recebem o id de
  ninguém: operam sobre quem está logado. Ninguém lê ou altera o perfil de
  outra pessoa por aqui (isso é do módulo de usuários, só para admin).
- **RN-PER-02 — Qualquer perfil acessa.** Atendente, admin e superAdmin.
- **RN-PER-03 — Dados exibidos.** Nome, apelido, e-mail, perfil, foto, modo
  "esconder meu nome" e os ids das filas e conexões do usuário. A senha nunca
  sai daqui.
- **RN-PER-04 — Apelido.** Opcional, até 100 caracteres, sem espaços nas
  pontas. Apelido em branco remove o apelido.
- **RN-PER-05 — Esconder meu nome.** Liga ou desliga o modo permanente que
  omite o nome do atendente nas mensagens.
- **RN-PER-06 — Filas e conexões: só admin.** Admin e superAdmin escolhem as
  próprias filas e conexões; o atendente só vê as dele (quem define é o admin,
  no módulo de usuários). A lista enviada substitui a atual, e filas ou
  conexões de outra empresa são ignoradas.
- **RN-PER-07 — Opções da empresa.** As filas e conexões oferecidas para
  escolha são só as da empresa do usuário. Quem não tem empresa (superAdmin)
  não tem opções.
- **RN-PER-08 — Foto: formato e tamanho.** JPG, PNG ou WEBP, até 5 MB.
- **RN-PER-09 — Uma foto por usuário.** Enviar uma nova substitui a anterior,
  e o arquivo antigo é apagado só depois que a nova foi registrada — se algo
  falhar, a foto anterior continua.
- **RN-PER-10 — Foto recusada não deixa rastro.** Formato errado, tamanho
  acima do limite ou falha ao registrar: o arquivo enviado é descartado e a
  foto atual não muda.
- **RN-PER-11 — Alteração de filas/conexões é tudo ou nada.** Se algo falhar
  no meio, as associações anteriores continuam.

## Validações e mensagens

Erros deste módulo trazem a mensagem em `message` (é o campo que a tela lê);
`error` traz o mesmo texto.

| Situação | Status | Mensagem |
|---|---|---|
| Apelido que não é texto | 400 | `nickname inválido` |
| Apelido com mais de 100 caracteres | 400 | `nickname deve ter no máximo 100 caracteres` |
| "Esconder nome" que não é sim/não | 400 | `hide_name_active inválido` |
| Filas/conexões que não são lista de números | 400 | `queue_ids inválido` / `connection_ids inválido` |
| Atendente tentando mudar filas/conexões | 403 | `Apenas administradores podem alterar suas conexões e filas` |
| Foto sem arquivo | 400 | `Arquivo não enviado` |
| Foto em formato não aceito | 400 | `Formato inválido. Use JPG, PNG ou WEBP.` |
| Foto acima de 5 MB | 413 | `Arquivo maior que 5MB` |
| Usuário não existe mais | 404 | `Usuário não encontrado` |

## Pontos em aberto

- **Fotos acessíveis sem login** para quem tiver a URL (nome aleatório, mas
  sem controle de acesso) — mesmo caso das mídias de mensagens rápidas.
- **O formato é conferido pelo tipo informado pelo navegador**, não pelo
  conteúdo do arquivo. Um arquivo qualquer renomeado e enviado como
  `image/png` é aceito.
- Não há como remover a foto (só trocar).

## Mudanças na refatoração

- A foto antiga era apagada **antes** de gravar a nova; uma falha no meio
  deixava o usuário sem foto e com o perfil apontando para um arquivo
  inexistente (RN-PER-09).
- Entradas de tipo errado (apelido numérico, filas como texto…) e apelido
  maior que 100 caracteres davam `500`; agora `400`.
- A troca de filas/conexões não era atômica: as atuais eram apagadas antes de
  conferir as novas (RN-PER-11).
- `GET /selects` do superAdmin passou a responder listas vazias de forma
  explícita (antes dependia de uma consulta com empresa nula).
- A foto passa a ser recebida em fluxo direto para o disco, em vez de ser
  carregada inteira na memória.

## Código e testes

- `src/modules/meu-perfil/meu-perfil.service.ts` — regras e troca segura de foto.
- Upload via `src/core/http/multipart-form-reader.ts` (agora com mensagem de
  formato e limite de tamanho por módulo) e `src/core/storage/media-storage.ts`.
- `tests/modules/meu-perfil.test.ts` (API e disco),
  `tests/modules/hide-name.test.ts` e `tests/unit/meu-perfil.service.test.ts`.
