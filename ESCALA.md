# Guia de Escala — Quando e como rodar múltiplos bays

> Este documento explica **quando** o sistema precisa de mais de uma cópia do
> serviço de WhatsApp (bays) e **o que fazer** para chegar lá com segurança.
> Escrito para ser lido tanto por quem decide (parte 1) quanto por quem
> implementa (parte 2).

---

## Parte 1 — Explicação simples

### O que é o "bays"
O **bays** (`-api-baileys-kelmor`) é o serviço que segura as **linhas de WhatsApp**
conectadas. Ele fala direto com o WhatsApp: recebe as mensagens e envia as respostas.

### Uma cópia aguenta muita coisa
- **Muitos atendentes** no painel → 1 bays dá conta.
- **Muitos clientes** te mandando mensagem → 1 bays dá conta.
- O que pesa mesmo é a quantidade de **LINHAS de WhatsApp conectadas** ao mesmo tempo.

### Quando precisa de uma segunda cópia (réplica)
Só quando **uma cópia não aguenta mais o número de linhas conectadas** — tipo o
sistema virar uma plataforma com dezenas/centenas de números de WhatsApp de
vários clientes. Hoje o sistema roda **1 bays** e está longe disso.

### Onde a segunda cópia roda
Uma "cópia" é o **programa bays rodando de novo**. Pode ser:
- **Na mesma máquina**, se houver sobra de memória/CPU;
- **Numa VM nova**, quando a máquina atual está cheia (é o caso da VM atual de 2GB).

### Por que não é só "clonar e subir"
Com 2 bays, surge a pergunta: **qual cópia segura qual linha?** Quando o sistema
principal manda "responde essa mensagem", ele precisa acertar a cópia certa —
senão o recado vai pro lugar errado e a mensagem não sai. Resolver isso é a
**"Fase 3"** (roteamento por réplica), descrita abaixo. Sem ela, 2 bays se
atrapalham.

**Resumo:** crescer é um *projetinho* (VM nova + Fase 3), não um clique. Mas a
fundação (o broker RabbitMQ) já está instalada e pronta.

---

## Parte 2 — Guia técnico de implementação

### 2.1 Arquitetura hoje (1 réplica)
```
WhatsApp ──> bays (1 container) ──HTTP webhook──> Api-kelmor ──> Postgres
Api-kelmor ──HTTP baysPost (BAYS_URL único)──> bays  (envio de mensagem)
```
- **Recebimento:** bays → `POST /connection/messages-webhook/:id` (HTTP). Já existe
  também o caminho por RabbitMQ (exchange `messages`/`unified`), **desligado** por
  `USE_RABBITMQ=false`. O consumidor no backend já está pronto
  (`Api-kelmor/src/shared/rabbitmq.ts`).
- **Envio:** `Api-kelmor` chama `baysPost('/message/send/:id', ...)` num único
  `BAYS_URL` (`src/modules/whatsapp/whatsapp.service.ts` → `sendMessage`,
  `sendTextToPhone`, `sendMessageViaLid`).

### 2.2 O que já está pronto para escalar
- ✅ **Broker RabbitMQ** provisionado (`kelmor-rabbitmq` no `docker-compose.yml`),
  na rede `atendimento_kelmor-network`.
- ✅ **Rede compartilhada** — o bays já acessa essa rede (fix de rede aplicado).
- ✅ **Estado de sessão compartilhado** — as credenciais do Baileys ficam no Redis
  do Api-kelmor (endpoints `/auth-sessions*` em `src/shared/server.ts`, chaves
  `baileys:auth:*`). Ou seja, várias réplicas leem/gravam o mesmo estado.
- ✅ **Identidade de réplica** — o bays já tem a env `APP` (id da instância) e usa
  `LAZY_SESSION_INIT_ENABLED` para subir sessões sob demanda.
- ✅ **Consumidor de recebimento** no backend (`src/shared/rabbitmq.ts`), gated por
  `USE_RABBITMQ`.

### 2.3 O que FALTA — "Fase 3": envio roteado por réplica
O gargalo com múltiplas réplicas é o **envio**: o comando "envie esta mensagem"
precisa chegar **na réplica que mantém aquela linha**. O código do bays tem o
esqueleto disso, mas **não está ligado**:

- `queueConfig.sendMessageTopicExchange` = `send-message.topic.exchange`
  (`-api-baileys-kelmor/src/configs/rabbitmq.config.ts`).
- Routing key por conexão: `send.message.whatsapp.<whatsappId>`.
- `connectionUpdateServices.ts` já faz o **bind/unbind** dessa routing key ao
  abrir/fechar cada sessão — **mas** `createExclusiveInstanceQueue()` nunca é
  chamado, então o bind falha em runtime e **não há consumidor**.

**Passos para completar a Fase 3:**

1. **bays — criar a fila exclusiva e consumir** (`src/services/rabbitmqInitService.ts`):
   - Chamar `rabbitMQ.createExclusiveInstanceQueue()` no `init()`.
   - `rabbitMQ.consumeQueue(instanceQueue, worker)` onde o `worker` faz o parse do
     corpo `{ type, contact, payload, lid, priority, whatsapps }` e chama
     `sendMessageService(whatsappId, message, whatsapps)` — mesmo contrato do HTTP
     (`src/controllers/messageController.ts`).
   - Garantir que o bind em `connectionUpdateServices.ts:543` passe a funcionar
     (fila exclusiva existente).

2. **Api-kelmor — publicar o envio no topic exchange** em vez de (ou além de) HTTP:
   - Em `src/modules/whatsapp/whatsapp.service.ts`, quando `USE_RABBITMQ=true`,
     publicar em `send-message.topic.exchange` com routing
     `send.message.whatsapp.<connectionId>` o corpo `{ type, contact, payload,
     lid, priority }`.
   - **Manter `baysPost` HTTP como fallback** se a publicação falhar.
   - Reaproveitar o módulo `src/shared/rabbitmq.ts` (adicionar um `publish`).

3. **Distribuição de linhas entre réplicas:**
   - Cada réplica sobe com um `APP` único e um subconjunto de conexões
     (o startup do bays aceita filtro — ver `startSessions.ts` e o parâmetro de
     inicialização por url/instância).
   - Com `LAZY_SESSION_INIT_ENABLED=true`, sessões ociosas sobem sob demanda,
     equilibrando a carga.

### 2.4 Passo a passo para subir a 2ª réplica

1. **Provisionar** uma VM nova (a atual de 2GB já está cheia) OU garantir folga de
   RAM/CPU na atual.
2. **Subir o 2º bays** apontando para:
   - a **mesma rede** do broker/redis (`atendimento_kelmor-network`);
   - o **mesmo Redis** do Api-kelmor (estado de sessão compartilhado);
   - as **mesmas envs de banco** e `MAIN_BACKEND_URL`;
   - `APP` **único** (ex.: `instance_2`);
   - `USE_RABBITMQ=true`, `RABBITMQ_URL=kelmor-rabbitmq`, mesmas credenciais.
3. **Implementar a Fase 3** (2.3) nos dois lados.
4. **Ligar `USE_RABBITMQ=true`** no bays (todas as réplicas) e no Api-kelmor.
5. **Definir a divisão de linhas** entre réplicas (filtro de startup + lazy init).

### 2.5 Checklist de teste (em staging, nunca direto em produção)
- [ ] Broker acessível pelas réplicas (`kelmor-rabbitmq:5672`) e painel em `:15672`.
- [ ] Mensagem recebida numa linha da réplica A → cria ticket no Api-kelmor.
- [ ] Resposta enviada pelo painel → chega **na réplica que segura a linha** (não em outra).
- [ ] Derrubar uma réplica → suas linhas reconectam (na mesma ou realocadas) sem perder recebimento (fallback HTTP).
- [ ] Derrubar o broker → recebimento e envio caem para HTTP sem parar.

### 2.6 Cuidados
- **Nunca** ligar `USE_RABBITMQ=true` sem o broker no ar **e** os consumidores
  validados — senão mensagens vão para um exchange sem consumidor e se perdem
  (o HTTP fallback só dispara se a publicação **falhar**, não se ela "sumir" num
  exchange vazio).
- Manter o **HTTP como fallback** em todos os caminhos.
- Cada réplica precisa de `APP` único (evita colisão de nomes de fila/estado).

---

## Referências de código

| Papel | Arquivo |
|---|---|
| Consumidor de recebimento (pronto) | `Api-kelmor/src/shared/rabbitmq.ts` |
| Broker + rede | `Api-kelmor/docker-compose.yml` |
| Envio HTTP atual (a rotear na Fase 3) | `Api-kelmor/src/modules/whatsapp/whatsapp.service.ts` |
| Config de exchanges/filas do bays | `-api-baileys-kelmor/src/configs/rabbitmq.config.ts` |
| Bind por conexão (send-routing) | `-api-baileys-kelmor/src/services/Baileys/connectionUpdateServices.ts` |
| Init do RabbitMQ do bays (falta consumir) | `-api-baileys-kelmor/src/services/rabbitmqInitService.ts` |
| Contrato de envio (worker deve reproduzir) | `-api-baileys-kelmor/src/controllers/messageController.ts` |
