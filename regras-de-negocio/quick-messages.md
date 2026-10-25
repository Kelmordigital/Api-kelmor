# Mensagens rápidas

Respostas prontas que o atendente envia no chat com um clique: um texto, uma
mídia (imagem, vídeo, áudio, PDF) ou os dois.

**Rotas:** `/api/v1/configuracao/quick-messages` — listar (`GET`), criar
(`POST`), editar (`PUT /:id`), remover (`DELETE /:id`). Criação e edição usam
`multipart/form-data` com os campos `title`, `message`, `file` e `remove_media`.

## Regras

- **RN-QM-01 — Título obrigatório.** Toda mensagem rápida tem título; espaços
  nas pontas são removidos. Título vazio é recusado ao criar e ao editar.
- **RN-QM-02 — Conteúdo obrigatório.** A mensagem precisa ter **texto, mídia
  ou os dois**. Vale ao criar e também ao editar: não dá para tirar a mídia de
  uma mensagem que não tem texto (nem o contrário).
- **RN-QM-03 — Tipos de mídia aceitos.** PNG, JPEG, WebP, GIF, MP4, MP3 e PDF.
  Tamanho máximo: 50 MB (limite geral de upload da API).
- **RN-QM-04 — Uma mídia por mensagem.** Se o formulário trouxer mais de um
  arquivo, vale o último.
- **RN-QM-05 — Troca de mídia.** Enviar um arquivo na edição substitui o atual,
  e o arquivo antigo é apagado. Se vierem um arquivo novo e `remove_media=true`
  juntos, o arquivo novo vale.
- **RN-QM-06 — Remover mídia.** `remove_media=true` (sem arquivo novo) tira a
  mídia da mensagem e apaga o arquivo, desde que a mensagem continue com texto
  (RN-QM-02).
- **RN-QM-07 — Edição parcial.** Campos não enviados mantêm o valor atual.
- **RN-QM-08 — Nenhum arquivo perdido.** Se a criação ou a edição for recusada
  (validação, mensagem não encontrada, tipo de arquivo inválido), o arquivo
  enviado é descartado. Ao remover uma mensagem, sua mídia é apagada.
- **RN-QM-09 — Listagem paginada.** Mais antigas primeiro. 10 por página por
  padrão, no máximo 50. Valores inválidos de página/limite usam o padrão.
- **RN-QM-10 — Busca.** Pelo título, sem diferenciar maiúsculas. O texto
  digitado é procurado literalmente (`50%` encontra "50%", não "50 qualquer
  coisa").
- **RN-QM-11 — Acesso.** Qualquer usuário autenticado da empresa — inclusive
  o atendente — lista, cria, edita e remove.
- **RN-QM-12 — Onde a mídia fica.** Em `uploads/quick-messages/<empresa>/`,
  com nome aleatório, servida publicamente em `/uploads/...`.

## Validações e mensagens

| Situação | Status | Mensagem |
|---|---|---|
| Título ausente ou em branco | 400 | `Campo "title" é obrigatório` |
| Sem texto e sem mídia | 400 | `É obrigatório ter mensagem de texto ou arquivo de mídia` |
| Arquivo de tipo não aceito | 400 | `Tipo de arquivo não permitido: <tipo>` |
| Id não numérico | 400 | `id inválido` |
| Mensagem não existe ou é de outra empresa | 404 | `Mensagem rápida não encontrada` |

## Pontos em aberto

- **Atendente pode editar e apagar as mensagens da empresa inteira.** Hoje não
  há dono da mensagem nem restrição por perfil. Confirmar se é o desejado ou
  se a gestão deveria ser só do admin.
- **Mídia acessível sem login.** Quem tiver a URL abre o arquivo. O nome
  aleatório dificulta adivinhar, mas não é controle de acesso.
- A busca olha só o título, não o texto da mensagem.

## Mudanças na refatoração

- Arquivos ficavam órfãos em disco quando a requisição era recusada (título
  faltando, mensagem de outra empresa, vários arquivos). Agora são apagados
  (RN-QM-08).
- A edição aceitava título vazio e deixava a mensagem sem texto e sem mídia.
  Agora as mesmas regras da criação valem (RN-QM-01, RN-QM-02).
- Arquivo novo + `remove_media=true` gravava o arquivo mas não o associava.
  Agora o arquivo novo vale (RN-QM-05).
- O arquivo antigo era apagado **antes** de gravar a alteração; agora só
  depois que ela dá certo.
- `page`/`limit` não numéricos e id não numérico respondiam `500`.
- `%` e `_` na busca funcionavam como curingas.

## Corrigido no front

- Apagar o texto na edição não apagava: a tela não enviava `message` vazio, e
  a API entende "campo não enviado" como "manter" (RN-QM-07). O front agora
  sempre envia `message`; vazio significa "sem texto".

## Código e testes

- `src/modules/quick-messages/quick-messages.service.ts` — regras e ciclo de
  vida da mídia.
- `src/core/storage/media-storage.ts` e `src/core/http/multipart-form-reader.ts`
  — upload reutilizável (próximos: bots, meu-perfil, whatsapp-oficial).
- `tests/modules/quick-messages.test.ts` (API, inclui o disco) e
  `tests/unit/quick-message.service.test.ts` (regras).
