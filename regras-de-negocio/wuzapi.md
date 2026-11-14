# WuzAPI — o novo motor do WhatsApp

A WuzAPI é o programa que mantém o número de WhatsApp conectado e entrega as
mensagens para a API Kelmor. Ela faz o mesmo papel que a **bays** (nosso
servidor em cima da biblioteca Baileys) fazia sozinha até 13/11/2026.

As duas convivem: o motor é escolhido **por conexão** (por número). Uma conexão
pode ir para a WuzAPI sem mexer nas outras, e voltar para a bays se precisar.

**Situação em 14/11/2026**

| | |
|---|---|
| Em produção desde | 13/11/2026 (commit `03a67d4` da API) |
| Conexões na WuzAPI | **filipe01** (id 7, número de teste, conectado) e **KAMILA** (id 5, migrada mas ainda **sem parear**) |
| Conexões na bays | as demais |
| Código da WuzAPI | cópia nossa em `wuzapi-kelmor` (GitHub `Kelmordigital/wuzapi-kelmor`), base v1.1.0 |
| Imagem no prod | a nossa, `ghcr.io/kelmordigital/wuzapi-kelmor:d782451…` (desde 14/11/2026; antes `asternic/wuzapi:1.1.0`) |

---

## 1. Por que trocamos a bays

### O que aconteceu

- **12/11:** a KAMILA caía o tempo todo. A causa era um bug da bays: um erro
  500 apagava a sessão. Foi corrigido (`4cb6f73` na bays).
- **13/11:** a KAMILA aparecia **conectada**, mas **nenhuma mensagem
  chegava**. Nos logs da bays:
  - em toda abertura de sessão, a primeira consulta ao WhatsApp (`fetchProps`)
    ficava sem resposta e dava timeout em 35 s;
  - a conexão caía com código **428** a cada 20–40 min, reconectava, e o ciclo
    se repetia;
  - o log `Mensagem recebida!` (gravado para toda mensagem que chega) apareceu
    **zero vezes** em 2h30. O WhatsApp abria o canal, mas não mandava nada
    por ele.

Esse quadro é típico de **outro aparelho usando a mesma sessão** e recebendo as
mensagens no lugar do nosso servidor. A suspeita principal era o cluster
antigo da DigitalOcean, que voltou a responder depois da migração para a
Hetzner. **Isso não chegou a ser confirmado.**

### Por que trocar mesmo assim

O problema daquele dia não justificava a troca sozinho. O que pesou foi o
acúmulo:

1. **A bays é código nosso para manter.** Todo bug de conexão, sessão,
   criptografia e LID cai na nossa mesa, e o protocolo do WhatsApp muda sem
   aviso.
2. **Bugs graves recorrentes.** O erro 500 que apagava a sessão (12/11), e um
   que ainda existe: quando **uma** conexão da bays é desconectada (401/403), o
   tratamento apaga as credenciais (`baileys:auth:*`) de **todas** as conexões
   da bays. Isso aconteceu em 13/11, quando as conexões 3 e 6 foram
   desconectadas.
3. **Instabilidade de reconexão e sessão**, que é justamente o ponto forte do
   motor da WuzAPI (o whatsmeow).

> **Importante:** WuzAPI, Baileys e qualquer alternativa não oficial usam **o
> mesmo protocolo do WhatsApp Web**. Se outro aparelho usar a sessão, ou se o
> número for restringido pelo WhatsApp, a WuzAPI sofre igual. A única opção sem
> esse risco é a API oficial da Meta (Cloud API), que é paga por conversa e
> exige modelos de mensagem aprovados.

### Por que a WuzAPI e não a Zapo

As duas candidatas foram comparadas em 13/11/2026:

| | **WuzAPI** (escolhida) | **Zapo** |
|---|---|---|
| O que é | Servidor pronto (Go) sobre o **whatsmeow** | **Biblioteca** TypeScript; o servidor REST é de outro autor (`zapo-rest`) |
| Idade | Desde 2022; o whatsmeow é de 2021 | Criada em março de 2026 |
| Comunidade | WuzAPI ★1.054; whatsmeow ★7.846, usado em bridges do Matrix e em muitos produtos comerciais | Zapo ★282, com ~380 de ~395 commits de **uma pessoa**; `zapo-rest` ★8 |
| Integração | Container separado: QR, envio e webhook para a nossa API | Teríamos de escrever o servidor em volta dela, de novo |
| Risco | Baixo: muito usada em produção | Alto: pouco testada e dependente de um único mantenedor |

A Zapo tem vantagens (é TypeScript e foi feita para muitas sessões com pouca
memória). Vale reavaliar quando tiver mais gente mantendo e mais uso em
produção.

---

## 2. Como funciona

```
 Celular do cliente
        │  WhatsApp
        ▼
┌──────────────────┐   webhook assinado (HMAC)    ┌──────────────────┐
│  WuzAPI (pod)    │ ───────────────────────────▶ │  api-04          │
│  wuzapi:8080     │   POST /wuzapi/webhook/:id   │  (2–3 réplicas)  │
│  sessões: SQLite │ ◀─────────────────────────── │                  │
└──────────────────┘   envio / QR / status        └──────────────────┘
        │              http://wuzapi:8080                  │
        │ mídia recebida                                   │ Postgres, Redis,
        ▼                                                  ▼ Socket.IO → front
 Cloudflare R2 (mesmo bucket)                       tickets, mensagens, bots
```

### Recebendo uma mensagem

1. A WuzAPI recebe a mensagem do WhatsApp. Se for mídia, grava o arquivo no R2.
2. Ela chama `POST http://api-04/wuzapi/webhook/<id da conexão>` com o evento
   em JSON, assinado com a chave daquela conexão (`x-hmac-signature`).
3. A API confere a assinatura e responde `200` na hora. Sem assinatura válida
   responde `401` e descarta.
4. O evento é **traduzido para o formato que a bays mandava**
   (`wuzapi-event-translator.ts`) e segue pelo **mesmo caminho de sempre**
   (`handleMessagesWebhook`): contato, ticket, bot, pesquisa, mídia. Por isso
   tickets, filas, bots e relatórios não precisaram mudar.

### Enviando uma mensagem

A API chama a WuzAPI direto pela rede interna do cluster: `/chat/send/text`,
`/chat/send/image|video|audio|document`, `/chat/send/contact`,
`/chat/send/poll`. A mídia vai por URL pública, e a WuzAPI baixa o arquivo.

### Conectando um número

1. No CRM, *Conexões* → **Conectar**.
2. A API derruba qualquer sessão da bays com o mesmo id (`/session/delete`),
   para os dois motores não disputarem o número.
3. Cria o "usuário" da conexão na WuzAPI, se ainda não existir
   (`conn-<id>`, já com webhook, eventos, chave HMAC e R2).
4. Regrava a chave HMAC (por causa de um bug da 1.1.0, ver seção 5) e pede a
   conexão.
5. O QR chega por webhook e aparece no front como imagem. Também dá para
   parear por código, sem QR.
6. No celular, o aparelho conectado aparece como **"Kelmor"**.

### Credenciais sem banco

O token de cada conexão na WuzAPI e a chave que assina os webhooks dela são
**calculados** a partir de um segredo único (`WUZAPI_SECRET`) e do id da
conexão. Não há token salvo no banco. Consequência: **trocar `WUZAPI_SECRET`
invalida todas as conexões da WuzAPI**, e todas precisam ser recriadas e
pareadas de novo.

---

## 3. Infraestrutura

Tudo roda no cluster k3s da Hetzner, namespace `prod`. Manifestos em
`Infra/k8s/prod/wuzapi-deployment.yaml` e `wuzapi-service.yaml`.

| Peça | Como está | Por quê |
|---|---|---|
| **Deployment `wuzapi`** | 1 réplica, estratégia `Recreate` | Uma sessão do WhatsApp só pode estar aberta em um lugar, e o SQLite só aceita um processo. Numa troca de versão, a antiga desliga antes de a nova subir (10–30 s fora do ar) |
| **Disco `wuzapi-data`** | PVC de 2 Gi (`local-path`, no servidor `k3s-kelmor`), montado em `/app/dbdata`. Dois bancos SQLite: `main.db` (chaves das sessões do WhatsApp) e `users.db` (cadastro das conexões) | Guarda as sessões. **Se for apagado, todos os números precisam parear de novo**, por isso tem backup (seção 6) |
| **CronJob `wuzapi-backup`** | A cada 6 h, para o R2, criptografado; guarda 14 dias | O disco só existe num servidor |
| **Service `wuzapi`** | `ClusterIP`, porta 8080, **sem Ingress** | Só a api-04 fala com ela. Nada fica exposto na internet |
| **`/tmp`** | `emptyDir` de 1 Gi | Mídia em trânsito; some com o pod, de propósito |
| **Recursos** | pede 50m CPU / 128 Mi; limite 500m / 512 Mi | |
| **Saúde** | readiness e liveness em `GET /health` | |

**Variáveis da WuzAPI**
- No manifesto: `WUZAPI_PORT=8080`, `WEBHOOK_FORMAT=json`,
  `TZ=America/Sao_Paulo`, `SESSION_DEVICE_NAME=Kelmor`,
  `WUZAPI_AUTO_PRESENCE=unavailable` (com `available`, o celular para de
  receber notificações, e os atendentes usam o celular),
  `WUZAPI_MEDIA_TMPDIR=/tmp`, `LOG_LEVEL=info`.
- Secret `wuzapi-secrets`: `WUZAPI_ADMIN_TOKEN` e
  `WUZAPI_GLOBAL_ENCRYPTION_KEY`. Cópia local em `Infra/k8s/prod/wuzapi.env`
  (fora do git).
- Secret `wuzapi-backup-secrets`: `BACKUP_PASSPHRASE`, a senha dos backups.
  Cópia local em `Infra/k8s/prod/wuzapi-backup.env` (fora do git). **Sem essa
  senha os backups não abrem**: guarde uma cópia no gerenciador de senhas.

**Variáveis da API** (Secret `api-04-secrets`)
- `WUZAPI_URL` (`http://wuzapi:8080`), `WUZAPI_ADMIN_TOKEN`, `WUZAPI_SECRET`
  (mínimo de 32 caracteres) e `WUZAPI_WEBHOOK_BASE_URL` (a API vista de dentro
  do cluster, `http://api-04`). Também estão no `Infra/k8s/prod/api-04.env`
  desde 14/11/2026 (antes só existiam no cluster).
- `WUZAPI_CONNECTION_IDS`: força conexões para a WuzAPI sem mexer no banco.
  Hoje vale `5` (KAMILA).
- Sem essas variáveis a API sobe normal; só as conexões da WuzAPI falham, com
  mensagem clara.
- A mídia recebida usa as mesmas variáveis `R2_*` da API.

### Por que SQLite e não Postgres

O plano era usar um banco próprio no Postgres do `db-eu`, e o ambiente de dev
está preparado assim (`Infra/k8s/dev/wuzapi-setup.sh`). No prod a criação desse
banco não foi possível na hora da implantação, então a WuzAPI usa SQLite num
disco persistente. Com uma réplica só, isso funciona bem. Migrar para o
Postgres é opcional.

### O código e a imagem (controle de versão)

A WuzAPI não roda direto do projeto original. Temos uma cópia própria, para
nada mudar sem a gente decidir:

- **Pasta local:** `Atendimento - Kelmor/wuzapi-kelmor`. **GitHub:**
  `Kelmordigital/wuzapi-kelmor` (privado). Base: v1.1.0. Licença MIT, que
  permite copiar e modificar.
- **Push na `main`** gera a imagem `ghcr.io/kelmordigital/wuzapi-kelmor:<commit>`
  (workflow `kelmor-image.yml`). **Não faz deploy.**
- **O prod só muda** quando a imagem é trocada no
  `Infra/k8s/prod/wuzapi-deployment.yaml` e o arquivo é aplicado.
- **Atualizações do projeto original nunca entram sozinhas.** O original está
  cadastrado como `upstream`, só para consulta:
  ```bash
  git fetch upstream --tags
  git log main..v1.2.0 --oneline   # ver o que mudou
  git merge v1.2.0                 # só se quiser trazer
  ```
- O cluster baixa a imagem com o mesmo segredo da API e da bays
  (`ghcr-pull-secret`).

### Onde corrigir um bug

| O bug está em | Onde mexer |
|---|---|
| Tradução de mensagens, envio, QR, status, assinatura (a maioria dos casos) | API: `src/modules/whatsapp/wuzapi/` e os desvios por motor em `whatsapp.service.ts` |
| Configuração (versão, variáveis, disco) | `Infra/k8s/prod/wuzapi-*.yaml` |
| Dentro da própria WuzAPI | Em ordem: contornar pela API; trazer a versão que corrige (`git merge`); corrigir na nossa cópia `wuzapi-kelmor` |

---

## 4. Regras

- **RN-WUZ-01 — Motor por conexão.** `at_connections.type = 'wuzapi'` usa a
  WuzAPI; `'whatsapp'` (padrão) usa a bays; `'whatsapp-oficial'` usa a Cloud
  API. A conexão também vai para a WuzAPI se o id estiver em
  `WUZAPI_CONNECTION_IDS`. Criar conexão aceita `engine: "bays" | "wuzapi"`
  (padrão `bays`); outro valor responde `400 engine inválido`. Se a WuzAPI não
  estiver configurada no ambiente, `engine: "wuzapi"` responde
  `400 WuzAPI não está disponível neste ambiente`.
- **RN-WUZ-02 — A bays não abre conexões da WuzAPI.** A lista que a bays
  reconecta ao subir (`GET /connection`) omite as conexões da WuzAPI, e os
  avisos da bays sobre elas são ignorados. Senão os dois motores disputariam o
  mesmo número.
- **RN-WUZ-03 — Uma conexão = um usuário na WuzAPI** (`conn-<id>`), criado sob
  demanda ao conectar, com credenciais derivadas de `WUZAPI_SECRET` (seção 2).
- **RN-WUZ-04 — Webhook autenticado.** `POST /wuzapi/webhook/:id` só aceita o
  corpo assinado (`x-hmac-signature` = HMAC-SHA256 em hex do corpo cru, com a
  chave da conexão `:id`). Sem assinatura válida responde `401`. Responde `200`
  antes de processar, para a WuzAPI não reenviar (e duplicar) mensagens. Fica
  fora do rate limit.
- **RN-WUZ-05 — Mesmo fluxo de mensagem da bays.** O evento `Message` é
  traduzido para o formato da bays e segue pelo mesmo `handleMessagesWebhook`.
  Não viram conversa: status, canais (`@newsletter`), listas de transmissão,
  reações, votos de enquete e mensagens de protocolo. Grupos continuam
  descartados.
- **RN-WUZ-06 — Contato por LID.** Quando o chat é `<lid>@lid` (contato que
  conversa sem expor o número), o número revelado pela Meta vem de `SenderAlt`
  (mensagem recebida) ou `RecipientAlt` (enviada de outro aparelho). Respostas
  a contato só com LID saem para `<lid>@lid`.
- **RN-WUZ-07 — Mídia recebida** é gravada pela própria WuzAPI no mesmo bucket
  R2 (chaves `users/<usuário>/inbox/...`) e chega para a API como URL.
- **RN-WUZ-08 — Status da conexão.** Logado na WuzAPI = `connected`. Canal
  aberto sem login = QR (`qr_ready`) ou `loading_qr`. Estados de espera são
  sempre confirmados na WuzAPI, para o card não ficar "Aguardando..." preso se
  um webhook se perder. QR expirado volta para `disconnected`, com 20 s de
  tolerância logo após pedir a conexão. WuzAPI fora do ar = vale o que está no
  banco.
- **RN-WUZ-09 — Conexão que a WuzAPI não conhece é desconectada.** Se a WuzAPI
  responde `401` para uma conexão (ex.: nunca pareada nela), o status é
  `disconnected`. Antes ela aparecia conectada para sempre, por causa do cache
  antigo da bays.
- **RN-WUZ-10 — Só derruba o que exige ação humana.** `LoggedOut`,
  `TemporaryBan`, `ConnectFailure` e QR expirado marcam `disconnected`, com
  e-mail de queda, aviso no front e registro na tabela de saúde.
  `Disconnected` e `KeepAliveTimeout` são ignorados, porque o whatsmeow
  reconecta sozinho, e marcar desconectado mandaria e-mail a cada oscilação de
  rede.
- **RN-WUZ-11 — Desconectar uma conexão da WuzAPI não apaga as credenciais da
  bays.** O passo que apaga `baileys:auth:*` é pulado para a WuzAPI.
- **RN-WUZ-12 — Verificação de saúde** (a cada 5 min) consulta a WuzAPI, e não
  a bays, para as conexões da WuzAPI.

Se o número de um ticket cair, a resposta sai por outro número conectado da
empresa. Essa regra vale para os dois motores e está em
[atendimento-automatico.md](atendimento-automatico.md) (RN-AUTO-06 e 07).

---

## 5. Erros e dificuldades da implantação

Tudo o que deu errado entre 13 e 14/11/2026, e como foi resolvido:

| # | Sintoma | Causa | Solução |
|---|---|---|---|
| 1 | WuzAPI reiniciando sem parar (*CrashLoop*, erro "too many colons") | O Service se chama `wuzapi`, e o Kubernetes injeta sozinho `WUZAPI_PORT=tcp://<ip>:8080`, que colide com a variável de porta da própria WuzAPI | `enableServiceLinks: false` e `WUZAPI_PORT=8080` no manifesto |
| 2 | Não foi possível criar o banco da WuzAPI no `db-eu` | Sem acesso ao servidor do banco na hora | SQLite num disco persistente (seção 3) |
| 3 | **QR não aparecia** no front | **Bug da WuzAPI 1.1.0:** conexão criada com ela já rodando guarda no cache só a informação de que existe uma chave, não a chave. Os webhooks saíam **sem assinatura**, e a API recusava (`401`) | A API passou a regravar a chave (`/session/hmac/config`) antes de toda conexão (`134038b`) |
| 4 | Conexão 8 sem QR mesmo depois da correção | Foi criada enquanto a API antiga ainda estava no ar | Chave regravada à mão; depois a conexão foi apagada |
| 5 | Card preso em "Aguardando..." até clicar em Sincronizar | O status de espera só mudava por webhook; se um se perdia, o card travava | Estados de espera passaram a ser confirmados direto na WuzAPI (`c306a4a`) |
| 6 | Conexão nova criada sem pedir o motor, indo para a bays | O app desktop (Electron) usa uma cópia do front embutida no instalador e ainda não tinha o seletor de motor | Usar o navegador. O app só recebe mudanças do front com um instalador novo |
| 7 | Conectado na WuzAPI, mas a resposta não saía | O ticket era de um número antigo (conexão 3, na bays, desconectada). Cada ticket responde pelo número em que foi aberto | Regra nova: número caído → responde por outro conectado (`158e6f8`) |
| 8 | `kubectl` parou de conectar | O IP do Filipe mudou, e a porta 6443 da Hetzner só aceita o IP cadastrado | Regra do firewall atualizada para o IP novo |
| 9 | "Mensagens não chegam" (alarme falso) | Os logs mostraram a WuzAPI entregando e a API aceitando; o teste estava sendo olhado na conta errada do CRM | Nenhuma. Ficou o roteiro de diagnóstico da seção 6 |
| 10 | Desconectar as conexões 3 e 6 apagou as credenciais de todas as conexões da bays | Bug antigo da bays (seção 1) | Ainda não corrigido; não afetou a WuzAPI (RN-WUZ-11) |

---

## 6. Operação

### Ver o que está acontecendo

```bash
export KUBECONFIG=~/.kube/kelmor-hetzner.yaml
kubectl -n prod get pods | grep wuzapi
kubectl -n prod logs deploy/wuzapi --since=30m                  # o que a WuzAPI recebeu e enviou
kubectl -n prod logs deploy/api-04 --since=30m | grep -i wuzapi # o que a API fez com isso
```

Se o `kubectl` não conectar, o IP de quem está usando provavelmente mudou:
atualize a regra da porta 6443 no firewall `k3s` da Hetzner.

### "As mensagens não chegam": por onde começar

1. **Conferir no CRM** se está na conta e na empresa certas, e se o ticket não
   caiu em outra aba (Pendentes, Bot).
2. **Logs da WuzAPI:** aparece `Calling user webhook` → `Webhook call
   successful` no horário? Se não aparece nada, a mensagem nem chegou à
   WuzAPI: confira os *Aparelhos conectados* no celular (aparelho estranho =
   outra sessão roubando as mensagens).
3. **Logs da API:** aparece `POST /wuzapi/webhook/<id> → 200`? Um `401` indica
   problema de assinatura (ver erro 3 da seção 5).
4. **Status da sessão:** `Jid=` preenchido nos logs `User info values` da
   WuzAPI indica número pareado.

### Migrar uma conexão existente da bays para a WuzAPI

1. Colocar o id em `WUZAPI_CONNECTION_IDS` no `api-04-secrets` (ex.: `5,12`) e
   reiniciar a api-04.
2. No CRM: **Desconectar** → **Conectar** → ler o QR (ou parear por código) com
   o celular do número.
3. O id não muda, então tickets e histórico continuam ligados.

**Para voltar para a bays:** tirar o id da variável, reiniciar a api-04 e ler o
QR de novo.

### Backup e restauração

**Backup automático** (`Infra/k8s/prod/wuzapi-backup-cronjob.yaml`):
- Roda às 00:15, 06:15, 12:15 e 18:15 UTC (21:15, 03:15, 09:15 e 15:15 em
  Brasília).
- Copia `main.db` e `users.db` com o `.backup` do SQLite, que é seguro com a
  WuzAPI rodando, e confere a integridade.
- Criptografa (AES-256) e testa se o arquivo abre de volta antes de enviar.
- Destino: `backups/wuzapi/wuzapi-<data UTC>.tar.gz.enc`, no bucket R2 da API.
  O bucket é público para as mídias, mas sem a senha o arquivo é inútil.
- Guarda as 56 cópias mais novas (14 dias) e apaga as mais antigas.
- Primeiro backup em 14/11/2026: 1,4 MB. A restauração foi testada num pod
  separado (abriu, bancos íntegros, sessão do filipe01 presente).

```bash
kubectl -n prod get cronjob wuzapi-backup                    # último e próximo horário
kubectl -n prod get jobs | grep wuzapi-backup                # resultado das últimas execuções
kubectl -n prod logs job/<nome do job>                       # detalhe ("Backup concluído.")
kubectl -n prod create job --from=cronjob/wuzapi-backup wuzapi-backup-manual-$(date +%s)   # backup agora
```

**Restaurar** (`Infra/k8s/prod/wuzapi-restore-job.yaml`, com o passo a passo no
topo do arquivo):
1. Parar a WuzAPI: `kubectl -n prod scale deploy/wuzapi --replicas=0`.
2. Aplicar o job de restauração (pega o backup mais novo, ou um específico).
   Ele guarda os bancos atuais em `antes-da-restauracao-<data>/`, no próprio
   disco, antes de substituir.
3. Ligar a WuzAPI: `kubectl -n prod scale deploy/wuzapi --replicas=1`.

Os números voltam sem ler QR, porque o pareamento fica no backup. Um backup de
algumas horas atrás pode ter as chaves de conversa um pouco desatualizadas:
algumas mensagens dos primeiros minutos podem chegar como "aguardando
mensagem" até o WhatsApp reenviar.

**Cluster perdido do zero:** recriar os Secrets a partir dos arquivos locais
(`wuzapi.env`, `wuzapi-backup.env`, `api-04.env`), criar o disco e seguir os
passos acima.

### Trocar a versão da WuzAPI

1. Na pasta `wuzapi-kelmor`: trazer a versão nova (`git merge vX.Y.Z`) ou
   corrigir o código, e fazer o push na `main`.
2. Esperar o workflow "Imagem Kelmor (GHCR)" ficar verde no GitHub.
3. Trocar o commit da imagem no `Infra/k8s/prod/wuzapi-deployment.yaml` e
   aplicar com `kubectl apply -f`. A WuzAPI fica de 10 a 30 s fora do ar e
   reconecta sozinha.
4. **Para voltar:** a imagem anterior no mesmo arquivo, e aplicar de novo.

---

## Pontos em aberto

- **KAMILA ainda não pareou na WuzAPI.** Enquanto isso, os tickets dela são
  respondidos pelo número de teste (filipe01). Precisa do celular dela para
  ler o QR.
- **Manifestos da WuzAPI sem commit** no repositório Infra (`k8s/prod`, incluindo
  backup e restauração, e `k8s/dev`).
- **Usuários sobrando na WuzAPI.** Em 14/11/2026 ela tinha `conn-7` (filipe01,
  pareado), `conn-8` (conexão já apagada no CRM) e `conn-10` (não pareado).
  Apagar a conexão no CRM não remove o usuário da WuzAPI. A KAMILA (`conn-5`)
  ainda não existe nela: o usuário é criado quando alguém clica em Conectar.
- **Ambiente de dev sem WuzAPI.** Os manifestos existem, e o
  `wuzapi-setup.sh` cria o banco no `db-eu`.
- **Áudio enviado:** a WuzAPI espera Opus/OGG, e a bays convertia. Áudio de bot
  em outro formato (ex.: mp3) pode falhar.
- **Figurinha enviada:** só sai como figurinha se já for webp; senão vai como
  imagem.
- **Confirmação de entrega e leitura** não é processada (também não era na
  bays).
- **Bug da bays que apaga as credenciais de todas as conexões** num 401/403:
  continua lá para as conexões que ficaram na bays.
- **Log enganoso:** a mensagem "QR code received from bays" aparece também
  para conexões da WuzAPI.
- **App desktop** precisa de um instalador novo para ter o seletor de motor e o
  QR da WuzAPI.
