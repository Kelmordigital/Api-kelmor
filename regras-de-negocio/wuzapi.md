# WuzAPI — motor WhatsApp alternativo ao bays

A WuzAPI ([asternic/wuzapi](https://github.com/asternic/wuzapi), em Go, sobre o
whatsmeow) faz o mesmo papel do bays (Baileys): mantém a sessão do WhatsApp Web
e entrega as mensagens para a API. O motor é escolhido **por conexão**, então
bays e WuzAPI convivem: uma conexão pode migrar sem mexer nas outras.

Código: `src/modules/whatsapp/wuzapi/` (cliente, credenciais, tradutor de
eventos, webhook) e os desvios por motor em `whatsapp.service.ts`.
Infra: `Infra/k8s/dev/wuzapi-*.yaml` e `wuzapi-setup.sh`.

## Regras

- **RN-WUZ-01 — Motor por conexão.** `at_connections.type = 'wuzapi'` usa a
  WuzAPI; `'whatsapp'` (padrão) usa o bays; `'whatsapp-oficial'` usa a Cloud
  API. Criar conexão aceita `engine: "bays" | "wuzapi"` (padrão `bays`); outro
  valor responde `400 engine inválido`. Se a WuzAPI não estiver configurada no
  ambiente, `engine: "wuzapi"` responde `400 WuzAPI não está disponível neste ambiente`.
- **RN-WUZ-02 — O bays não abre conexões da WuzAPI.** `GET /connection` (lista
  que o bays reconecta ao subir) omite as conexões `wuzapi`; senão os dois
  motores disputariam o mesmo número.
- **RN-WUZ-03 — Uma conexão = um usuário WuzAPI** (`conn-<id>`), criado sob
  demanda ao conectar. Token e chave HMAC são derivados de `WUZAPI_SECRET` + id
  da conexão: nada a guardar no banco. Trocar `WUZAPI_SECRET` invalida todos os
  usuários existentes (é preciso recriá-los e ler o QR de novo).
- **RN-WUZ-04 — Webhook autenticado.** `POST /wuzapi/webhook/:id` só aceita o
  corpo assinado (`x-hmac-signature` = HMAC-SHA256 hex do corpo cru com a chave
  da conexão `:id`); sem assinatura válida responde `401`. Responde `200` antes
  de processar, para a WuzAPI não reenviar (e duplicar) mensagens. Fica fora do
  rate limit.
- **RN-WUZ-05 — Mesmo fluxo de mensagem do bays.** O evento `Message` é
  traduzido para o formato do bays e segue pelo mesmo `handleMessagesWebhook`
  (contato, LID/username, ticket, bot, pesquisa, mídia). Não viram conversa:
  status, canais (`@newsletter`), broadcast, reações, votos de enquete e
  mensagens de protocolo. Grupos seguem descartados como hoje.
- **RN-WUZ-06 — Contato por LID.** Quando o chat é `<lid>@lid`, o número
  revelado pela Meta vem de `SenderAlt` (recebida) ou `RecipientAlt` (enviada
  de outro aparelho) e entra como `sender_pn`. Respostas a contato só-LID saem
  para o JID completo `<lid>@lid`.
- **RN-WUZ-07 — Mídia recebida** é gravada pela própria WuzAPI no mesmo bucket
  R2 (chaves `users/<usuário>/inbox/...`) e chega como `media.url`. Mídia
  enviada vai por URL pública (a WuzAPI baixa).
- **RN-WUZ-08 — Status da conexão.** Logado na WuzAPI = `connected`; socket
  aberto sem login = QR (`qr_ready`, imagem PNG em data URL) ou `loading_qr`;
  WuzAPI fora do ar = confia no banco (mesma política do bays).
- **RN-WUZ-09 — Só derruba o que exige ação humana.** `LoggedOut` (401),
  `TemporaryBan` (403), `ConnectFailure` e QR expirado marcam `disconnected`
  (com e-mail de queda, Socket.IO e tabela de saúde, como no bays).
  `Disconnected`/`KeepAliveTimeout` são ignorados: o whatsmeow reconecta sozinho.
- **RN-WUZ-10 — Logout de conexão WuzAPI não toca nas credenciais do bays.**
  O tratamento de 401 do bays apaga `baileys:auth:*`; para conexões WuzAPI esse
  passo é pulado (a WuzAPI descarta o próprio pareamento).
- **RN-WUZ-11 — Health check** (a cada 5 min) consulta a WuzAPI, e não o
  bays, para as conexões `wuzapi`.

## Configuração

API (`api-04-secrets`): `WUZAPI_URL`, `WUZAPI_ADMIN_TOKEN`, `WUZAPI_SECRET`
(≥ 32), `WUZAPI_WEBHOOK_BASE_URL` (a API vista de dentro do cluster, ex.
`http://api-04`). Todas opcionais: sem elas a API sobe normal e só as conexões
WuzAPI falham.

WuzAPI (`wuzapi-secrets`): `WUZAPI_ADMIN_TOKEN`, `WUZAPI_GLOBAL_ENCRYPTION_KEY`,
`DB_USER`, `DB_PASSWORD`, `DB_NAME` (banco próprio no `db-eu`).
`WUZAPI_AUTO_PRESENCE=unavailable`, para o celular continuar recebendo
notificações.

## Pontos em aberto

- **Áudio enviado:** a WuzAPI espera áudio em Opus/OGG; o bays convertia.
  Áudio de bot em outro formato (ex.: mp3) pode falhar. Validar no dev.
- **Figurinha enviada:** só sai como figurinha se já for webp/mp4; senão vai
  como imagem (o bays convertia para webp).
- **ACK (entregue/lido)** não é processado: hoje também é no-op para o bays.
- **Trocar o motor de uma conexão existente** (ex.: KAMILA) ainda é manual:
  derrubar a sessão no bays, `UPDATE at_connections SET type='wuzapi'` e ler o
  QR. O id não muda, então tickets e histórico continuam ligados.
- **Achado no código antigo (não alterado aqui):** no 401/403 do bays, o
  tratamento apaga também `baileys:auth:*` (padrão legado), ou seja, as
  credenciais de **todas** as conexões do bays, não só da que caiu.
