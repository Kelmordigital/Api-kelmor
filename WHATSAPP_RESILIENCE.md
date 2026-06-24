# WhatsApp — Histórico de Problemas e Soluções

> **Stack**: Fastify + Drizzle ORM + PostgreSQL + Redis (ioredis) + Baileys (bays, porta 4001) + React + Zustand  
> **Data**: Junho 2026

---

## Contexto

O sistema de atendimento usa um microserviço separado chamado **bays** (porta 4001) que mantém sessões WhatsApp via Baileys. A API-04 (porta 3000/3001) se comunica com o bays via HTTP e recebe eventos via webhooks. O frontend (React) se comunica com a API-04 via REST + Socket.IO.

---

## Problema 1 — Dashboard F5: seções de vendas sumiam ao recarregar

### Sintoma
Ao pressionar F5 no Dashboard, as seções de vendas desapareciam.

### Causa
O endpoint `GET /auth/me` usava `findById()` — que não fazia JOIN com a tabela `profiles`. Sem o campo `profile_tag` na resposta, o frontend não conseguia determinar as permissões do usuário e escondia as seções.

### Solução
Criado `findByIdWithProfile()` no `auth.repository.ts` com JOIN na tabela `profiles`. O `me()` no controller passou a retornar `profile_tag` junto com os outros campos do usuário.

---

## Problema 2 — WhatsApp desconectando a cada ~90 segundos (loop de 401)

### Sintoma
O WhatsApp conectava mas caia em ~90 segundos. Os logs mostravam clusters de 4 eventos `disconnect 401` quase simultâneos. O sistema tentava reconectar, gerava outro 401, e o ciclo se repetia infinitamente.

### Causa raiz
Após um logout 401, o bays deletava a sessão mas as **credenciais Baileys** (`baileys:auth:*`) permaneciam no Redis. O sistema detectava essas credenciais na Camada 4 do `getStatus()` e chamava `connect()` automaticamente — que tentava reconectar com credenciais inválidas — que gerava outro 401 — e assim por diante.

### Solução
Em `handleConnectionUpdate`, quando `code === 401 || code === 403`:
1. Apaga a sessão no bays (`DELETE /session/delete/{id}`)
2. Remove **todas** as chaves `baileys:auth:*` do Redis
3. Não tenta reconectar

```
401 recebido
  → apaga sessão no bays
  → apaga baileys:auth:* no Redis
  → status = 'disconnected'
  → PARA (não reconecta)
```

---

## Problema 3 — `flushdb` derrubou toda a autenticação

### Sintoma
Após executar `flushdb` no Redis para limpar dados de teste, todas as chamadas autenticadas começaram a retornar 401. Todos os usuários logados foram desautenticados.

### Causa
A sessão de autenticação é armazenada no Redis como `company-{companyId}-user-{userId}`. O `flushdb` apagou todas essas chaves. O endpoint `/auth/refresh` renovava o access token mas **não recriava** a chave de sessão no Redis.

### Solução
O `refresh()` no `auth.controller.ts` passou a recriar a chave de sessão Redis após emitir um novo token — exatamente como o `login()` faz. Isso significa que um Redis reiniciado ou limpo é reparado automaticamente no próximo refresh, sem forçar re-login.

---

## Problema 4 — Múltiplas conexões: status incorreto no WhatsApp.tsx

### Sintoma
Após criar uma nova conexão chamada "Filipe" (que recebeu um ID diferente de 1 no banco), a página de Conexões mostrava "CONECTADO" mas o WhatsApp.tsx (tela de conversas) mostrava "DESCONECTADO".

### Causa
Os endpoints `GET /whatsapp/status`, `POST /whatsapp/connect` e `DELETE /whatsapp/disconnect` usavam `SESSION_ID=1` hardcoded no `.env`. A nova conexão "Filipe" tinha um ID diferente (ex: 2) no banco.

### Solução
Criado `getCompanyConnectionId(req)` no `whatsapp.controller.ts` que lê a primeira conexão da empresa no banco de dados, com fallback para o `SESSION_ID` do `.env`:

```typescript
async function getCompanyConnectionId(req): Promise<number> {
    const [conn] = await db.select({ id: connections.id })
        .from(connections)
        .where(eq(connections.company_id, req.user.company_id))
        .orderBy(connections.id)
        .limit(1);
    return conn?.id ?? Number(env.BAYS_SESSION_ID);
}
```

---

## Problema 5 — "Erro ao remover" ao deletar conexão

### Sintoma
Ao tentar remover uma conexão, o sistema retornava erro.

### Causa
Violação de chave estrangeira: a tabela `at_connection_errors` tem `connection_id` referenciando `at_connections.id`. Ao tentar deletar a conexão, o banco rejeitava porque havia logs de erro vinculados.

### Solução
`removeConnection` passou a deletar primeiro os logs (`at_connection_errors`) e depois a conexão.

---

## Problema 6 — QR Code aparecia como imagem quebrada

### Sintoma
Ao clicar em "Conectar" e abrir o modal de QR, aparecia uma imagem quebrada em vez do QR.

### Causa
O bays envia uma **string raw** do QR (não uma data URL). O frontend tentava renderizar com `<img src={qrString}>`, que não funciona para strings raw.

### Solução
Instalado `react-qr-code` e substituído `<img>` por `<QRCode value={statusData.qr} size={200} />` que renderiza a string como SVG.

---

## Problema 7 — Redis sem persistência: QR em massa após restart

### Sintoma (potencial em produção)
Se o container Redis reiniciar, todas as credenciais Baileys armazenadas no Redis (`baileys:auth:*`) são perdidas. Com 900 clientes, isso forçaria 900 re-autenticações simultâneas via QR.

### Solução
`docker-compose.yml` atualizado para iniciar o Redis com AOF (Append Only File):

```yaml
command: >
  redis-server
  --appendonly yes
  --appendfsync everysec
  --save 60 1
```

- `appendonly yes` → persiste cada write no disco
- `appendfsync everysec` → flush a cada 1 segundo (equilíbrio performance/segurança)
- `save 60 1` → snapshot RDB a cada 60s se houver pelo menos 1 mudança

O volume `kelmor_redis_data` já existia e está montado — os dados persistem entre restarts do container.

---

## Arquitetura Implementada

### getStatus() — 4 Camadas

```
Camada 1: Redis (~1ms)
  ├── 'connected'    → retorna imediatamente
  ├── 'qr_ready'     → retorna com QR string
  ├── 'loading_qr'   → retorna (frontend mostra spinner)
  ├── 'reconnecting' → retorna (frontend mostra aguardando)
  └── 'needs_reauth' → retorna (circuit breaker ativo)

Camada 2: Banco de dados (~5ms)
  ├── status='connected' no banco → confirma com bays
  │   ├── bays confirma → reaquece Redis → retorna 'connected'
  │   └── bays discorda → atualiza banco para 'disconnected'
  └── bays inacessível → confia no banco com TTL curto (5min)

Camada 3: bays direto (~20ms)
  ├── bays diz 'open' → atualiza Redis + banco → retorna 'connected'
  └── bays diz offline → cai para Camada 4

Camada 4: credenciais no Redis
  ├── baileys:auth:{id}:* encontrado
  │   ├── Lock wa:reconnect_lock:{id} (30s) — evita chamadas múltiplas por polling
  │   ├── Enfileira reconnect no BullMQ (jitter 0-30s, max 30/min)
  │   └── retorna 'reconnecting'
  └── sem credenciais → retorna 'disconnected'
```

### handleConnectionUpdate() — Webhook do bays

```
type='qrcode'   → salva QR no Redis → status='qr_ready'

type='connected' → status='connected' no Redis e banco
                 → reseta circuit breaker (wa:consec_401)
                 → reseta lock de reconexão
                 → emite connection:status via Socket.IO
                 → upsert at_connection_health (consecutive_401s=0, status='healthy')

type='disconnected'
  → status='disconnected' no Redis e banco
  → emite connection:status via Socket.IO (frontend atualiza em tempo real)
  → loga em at_connection_errors
  → upsert at_connection_health (disconnect_count_24h++)
  
  se code=401 ou 403:
    → circuit breaker Redis: incr wa:consec_401:{id} (TTL 1h)
    
    se count >= 3:
      → status='needs_reauth' no Redis
      → emite connection:needs_reauth via Socket.IO
      → upsert at_connection_health (status='banned_suspect')
    
    se count < 3:
      → apaga sessão no bays
      → apaga baileys:auth:* no Redis
      → upsert at_connection_health (consecutive_401s++, status='needs_reauth')
```

### BullMQ — Fila de Reconexão com Jitter

Problema: com 900 clientes, um restart do Redis faria 900 sessões tentarem reconectar ao mesmo tempo. O WhatsApp detecta esse padrão como ataque e pode banir contas em massa.

Solução: `reconnection.queue.ts` usa BullMQ com:
- **Jitter**: delay aleatório de 0-30 segundos por job
- **Rate limiter**: máximo 30 reconexões por minuto
- **Backoff exponencial**: 5s → 10s → 20s → 40s → 80s (5 tentativas)
- **Deduplicação**: `jobId: reconnect:{id}` — ignora se já existe job para a mesma sessão

Resultado: 900 reconexões espalhadas ao longo de ~30 minutos em vez de 5 segundos.

### at_connection_health — Tabela de Saúde

Nova tabela para rastrear o histórico de saúde de cada conexão, com persistência além do TTL do Redis:

| Campo | Descrição |
|---|---|
| `connection_id` | FK para `at_connections.id` (cascade delete) |
| `disconnect_count_24h` | Contador de desconexões |
| `consecutive_401s` | Contador de logouts consecutivos |
| `last_401_at` | Timestamp do último 401 |
| `last_connected_at` | Timestamp da última conexão bem-sucedida |
| `status` | `healthy` / `degraded` / `needs_reauth` / `banned_suspect` |

Transições de status:
- `connected` → `healthy` (zera consecutive_401s)
- `disconnect >= 3` → `degraded` (se estava healthy)
- `401 recebido` → `needs_reauth`
- `401 >= 3 em 1h` → `banned_suspect` (para totalmente)

### Health Check Proativo — A cada 5 Minutos

`connection-health.job.ts` roda a cada 5 minutos:
1. Busca todas as conexões com `status='connected'` no banco
2. Para cada uma, consulta diretamente `GET /session/status/{id}` no bays
3. Se o bays diz offline mas o banco diz connected → chama `handleConnectionUpdate(id, { type: 'disconnected' })`

Isso detecta **sessões fantasma** — casos onde o bays caiu silenciosamente sem disparar o webhook de disconnect.

### Notificação em Tempo Real — Socket.IO

O frontend não depende mais apenas de polling para descobrir que a conexão caiu. Eventos emitidos:

| Evento | Quando |
|---|---|
| `connection:status` | Em qualquer mudança de status (connected/disconnected) |
| `connection:needs_reauth` | Circuit breaker ativado — QR manual necessário |

### Graceful Shutdown

Em `main.ts`, SIGTERM/SIGINT:
1. Para o health check interval
2. Fecha o worker BullMQ (aguarda jobs em progresso terminarem)
3. Fecha o servidor Fastify

Fechamento limpo reduz 401s pós-deploy — o WhatsApp não interpreta como queda abrupta.

---

## Estrutura de Arquivos Alterados

```
API-04/
├── docker-compose.yml                          ← Redis AOF adicionado
├── drizzle/
│   ├── 0003_connection_health.sql              ← NOVO: migration
│   └── meta/_journal.json                      ← entrada idx=3 adicionada
├── src/
│   ├── main.ts                                 ← graceful shutdown + BullMQ worker
│   ├── jobs/
│   │   ├── connection-health.job.ts            ← NOVO: health check 5min
│   │   └── reconnection.queue.ts               ← NOVO: BullMQ com jitter
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.repository.ts              ← findByIdWithProfile()
│   │   │   └── auth.controller.ts              ← me() com profile_tag; refresh() recria Redis
│   │   ├── atendimento/
│   │   │   └── atendimento.db.schema.ts        ← NOVO: tabela at_connection_health
│   │   └── whatsapp/
│   │       ├── whatsapp.service.ts             ← 4 camadas; circuit breaker; Socket.IO; BullMQ
│   │       ├── whatsapp.controller.ts          ← getCompanyConnectionId(); rotas multi-conexão
│   │       └── whatsapp.routes.ts              ← rotas /connections/*
└── Front end/CRM-imobiliaria/src/
    ├── App.tsx                                 ← rota /configuracoes/conexoes
    ├── pages/
    │   ├── Conexoes.tsx                        ← NOVO: página de gerenciamento de conexões
    │   └── Configuracoes.tsx                   ← tile "Conexões" ativado
    └── services/
        └── conexoes.service.ts                 ← NOVO: CRUD de conexões WhatsApp
```

---

## Redis Keys em Uso

| Chave | Descrição | TTL |
|---|---|---|
| `wa:status:{id}` | Status da conexão | 24h |
| `wa:qr:{id}` | String do QR code | 3min |
| `wa:consec_401:{id}` | Contador de 401s (circuit breaker) | 1h |
| `wa:reconnect_lock:{id}` | Lock para evitar reconexões simultâneas | 30s |
| `baileys:auth:{id}:*` | Credenciais Baileys da sessão | persistente |
| `company-{cId}-user-{uId}` | Sessão de autenticação do usuário | 7 dias |

---

## O Que Ainda NÃO Está Implementado (Para Escala 900+)

| Item | Impacto | Complexidade |
|---|---|---|
| Reset diário do `disconnect_count_24h` | Médio — hoje o contador nunca zera | Baixa |
| Notificação ativa ao cliente (email/SMS após X min desconectado) | Alto — cliente não sabe que caiu | Média |
| API de saúde pública (`GET /whatsapp/health/{id}`) | Médio — útil para monitoramento externo | Baixa |
| Restaurar estado do circuit breaker do banco no boot (após flushdb) | Médio — hoje um flushdb reseta o contador DB acumulado | Baixa |
| Controle de reconexão no lado do bays (staggered startup) | Alto — bays reiniciando ainda conecta 900 ao mesmo tempo | Alta |
