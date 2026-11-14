# Regras de negócio — resumo

Todas as regras da API Kelmor num lugar só, em poucas linhas por módulo. Os
códigos `RN-…` citados no código e nos testes vêm dos documentos detalhados
por módulo, que foram substituídos por este resumo. Os que já tinham sido
commitados continuam no histórico do git
(`git show e338d60:regras-de-negocio/<módulo>.md`); os de CRM, relatórios,
monitoramento e WuzAPI nunca entraram no git. Os testes
de cada módulo, em `tests/modules` e `tests/unit`, mostram cada regra
funcionando.

Atualizado em 14/11/2026. Ainda fora do resumo: **whatsapp** e
**atendimento** (tickets e mensagens), que são os próximos da refatoração.

---

## Regras que valem para tudo

- **Cada empresa só vê o que é dela.** Pedir um registro de outra empresa
  responde "não encontrado" (`404`), para não revelar que ele existe.
- **Três perfis:** `user` (atendente), `admin` (dono/gestor da empresa) e
  `superAdmin` (operador da Kelmor, sem empresa).
- **Erros sempre com mensagem:** `{ error, message }` com o mesmo texto, e o
  front mostra essa mensagem. Exceções: login, painel do superAdmin e a API
  pública de mensagens usam `{ statusCode, error, message }`.
- **Só os campos previstos são gravados.** Não dá para trocar id, empresa ou
  datas de criação pelo corpo da requisição.
- **Mídias enviadas ficam no Cloudflare R2** (pasta `api/`), abertas por
  endereço público; não somem nos deploys. Sem R2 configurado (testes),
  ficam no disco.
- **Edição parcial é o padrão:** na edição, só os campos enviados mudam.

## Quem pode o quê

| Módulo | Atendente | Admin | SuperAdmin |
|---|---|---|---|
| Meu perfil, notificações, tarefas (o próprio quadro) | ✅ | ✅ | ✅ |
| Mensagens rápidas, etiquetas, agendar mensagens | ✅ tudo | ✅ | ✅ com empresa |
| Filas, configurações gerais, motivos de não venda do CRM | só consulta | ✅ | ✅ com empresa |
| Linha do tempo do contato (CRM) | ✅ | ✅ | ✅ com empresa |
| Produtos | só pelo catálogo | ✅ | ✅ |
| Cupons, agenda, Google, campanhas, pesquisas, bots, API de mensagens, usuários, relatórios | ❌ | ✅ | ✅ com empresa |
| API Oficial: listar e enviar templates | ✅ | ✅ | ✅ com empresa |
| API Oficial: conectar número, criar e excluir templates | ❌ | ✅ | ✅ com empresa |
| Painel do superAdmin, histórico de métricas | ❌ | ❌ | ✅ |

"Com empresa": o superAdmin não tem empresa, então não usa o que só existe
dentro de uma (resposta `403 Empresa não encontrada`).

---

## 1. Contas e acesso

### Autenticação
- Login por e-mail (sem diferenciar maiúsculas) e senha. E-mail inexistente e
  senha errada têm a mesma resposta e o mesmo tempo.
- Para entrar: e-mail verificado, conta aprovada e empresa ativa (o
  superAdmin não tem empresa). Revogar a aprovação ou desativar a empresa
  derruba quem já estava logado, na hora.
- Sessão: acesso de 15 min e renovação de 7 dias (cookie). Logout encerra a
  sessão no servidor.
- Verificação em duas etapas (2FA) só para o superAdmin, com 10 códigos de
  recuperação.
- No máximo 5 tentativas por minuto por IP no login e no 2FA.
- Cadastro só com a chave do sistema; a conta nasce aguardando aprovação.

### Usuários
- O admin gerencia os usuários da própria empresa.
- Criado pelo admin, o usuário já nasce aprovado e entra na hora; sem perfil
  informado, vira atendente. Ninguém vira superAdmin por aqui.
- E-mail único no sistema inteiro; senha de no mínimo 8 caracteres.
- Trocar a senha ou o perfil de alguém derruba as sessões dessa pessoa.
- O admin não exclui a si mesmo; excluir corta o acesso na hora e mantém
  tickets e mensagens.

### Meu perfil
- Sempre sobre quem está logado: nome, apelido, foto e o modo "esconder meu
  nome" nas mensagens.
- Foto JPG, PNG ou WEBP de até 5 MB. A nova substitui a antiga e, se algo
  falhar, a antiga continua.
- Só admin escolhe as próprias filas e conexões; o atendente só vê as dele.

### Painel do superAdmin
- Números (empresas ativas, inativas e admins pendentes) e lista de
  empresas com a equipe e a situação: `INATIVA`, `PENDENTE` ou `ATIVA`.
- Cadastra empresa e admin juntos. O admin nasce aguardando aprovação.
- **Desativar empresa:** ninguém dela entra (quem estava logado cai na hora)
  e param os envios automáticos (agendamentos, campanhas, API de mensagens e
  bots). O WhatsApp continua conectado e recebendo. Reativar libera tudo,
  menos as campanhas, que voltam com play do admin.
- Aprova e revoga o acesso de contas; não revoga a si mesmo.

---

## 2. Atendimento

### Filas
- Nome obrigatório, cor, saudação, ativa/inativa e modo de distribuição.
- Pode atender: quem é da fila **e** tem acesso à conexão do ticket.
- **Distribuição automática** só para atendente online, com vaga (limite de
  atendimentos simultâneos) e conforme o modo: menor carga atual, quem menos
  atendeu ou mais ocioso. Empate é sorteado; sem candidato, o ticket fica
  pendente.
- Ticket novo, sem bot ativo, já nasce na fila quando a conexão tem uma só
  fila ativa.
- Desativar tira a fila dos tickets pendentes. Excluir tira de todos, e é
  bloqueado se um bot ativo transfere para ela.

### Atendimento automático
- **Fechamento de tickets parados:** com "Fechar tickets abertos/pendentes
  após (h)" ligado em Configurações, o ticket pendente, em atendimento ou no
  bot é finalizado sozinho quando foi **aberto** há pelo menos X horas e a
  **última mensagem é do cliente**. Se o atendente respondeu por último, não
  fecha; ticket sem mensagem ou com intervalo menor que 1 h também não.
- Não fecha: ticket aguardando a pesquisa de satisfação, ticket apagado ou de
  empresa desativada.
- Ao fechar, manda a despedida (se ligada e respeitando o intervalo), exceto
  para quem já cumpria a regra havia mais de 2 h: esses fecham sem despedida,
  para não disparar dezenas de mensagens de uma vez (o WhatsApp bloqueia).
- O fechamento fica no histórico sem usuário e não dá XP. Roda a cada 5 min,
  até 100 tickets por vez (os mais antigos primeiro), uma vez só mesmo com
  várias réplicas.
- **Resposta por outro número:** se a conexão do ticket estiver
  desconectada, a resposta (do atendente ou a despedida) sai por outra conexão
  conectada da mesma empresa, e o ticket passa para ela. Prefere WhatsApp
  comum (bays/WuzAPI) à API Oficial. Sem nenhuma conectada, falha como antes.

### Etiquetas
- Nome obrigatório, cor e ícone. Aplicar no contato de novo não duplica;
  excluir a etiqueta a tira de todos os contatos.
- **Regras automáticas** (até 10 por empresa): se qualquer variação da
  palavra-chave aparecer na mensagem, inclusive dentro de outra palavra, as
  etiquetas são aplicadas ao contato. Precisa do "etiquetamento automático"
  ligado.
- Estatísticas: contatos por etiqueta e aplicações nos últimos 7 dias.

### Mensagens rápidas
- Título obrigatório e texto, mídia ou os dois. Uma mídia por mensagem (PNG,
  JPEG, WebP, GIF, MP4, MP3 ou PDF, até 50 MB).
- Trocar ou remover a mídia apaga o arquivo antigo; envio recusado não deixa
  arquivo para trás.
- Lista paginada (10 por página, até 50) com busca pelo título.

### Agendamento de mensagens
- Vai para o contato do ticket, pela conexão do ticket. Mensagem de até 4096
  caracteres; data no passado sai no próximo ciclo.
- O servidor envia a cada 30 segundos, **uma vez só**, mesmo com várias
  réplicas, e reiniciar não perde nada.
- Enquanto "Agendada", qualquer um da empresa edita ou cancela.
- **Falhou:** fica como falha com o motivo e não é reenviada. Quem agendou e
  os admins são avisados no sino. Empresa desativada: vira falha
  ("Empresa inativa") e não sai depois.

### Pesquisas de satisfação
- Nome e ao menos uma opção; ligada a filas. Vale a pesquisa **ativa** da fila
  do ticket (a mais recente, se houver mais de uma).
- **Encerrar com pesquisa:** o cliente recebe as opções numeradas e o ticket
  espera a resposta. Responder com o número ou o texto exato fecha o ticket de
  vez; outra mensagem segue como conversa normal.
- Relatório por opção (quantidade e percentual), filtrável por período e
  atendente.

### Notificações
- O sino mostra as 50 mais recentes e o total de não lidas. Clicar marca como
  lida e abre o atendimento.
- Aviso na hora para quem está com o sistema aberto; o sino também se
  atualiza a cada minuto.
- Hoje há um tipo: mensagem agendada que falhou (vai para quem agendou e para
  os admins, sem repetir).

### Tarefas
- Quadro pessoal com as colunas fixas **Pilha de Ação** e **Concluídas**,
  mais colunas próprias. Excluir uma coluna devolve as tarefas para a Pilha.
- Tarefa nova entra no topo; pode ter prazo e um contato da empresa. Estar
  em Concluídas é estar concluída; arquivar tira do quadro sem apagar.
- O admin vê o quadro de outro usuário da empresa, sem poder alterar.
- Na conversa com um contato aparecem as tarefas da pessoa logada para ele.

---

## 3. Vendas e CRM

### CRM
- **Motivos de não venda** (texto e cor) e **palavras-chave de origem**: na
  primeira mensagem de um ticket novo, a primeira palavra-chave encontrada
  define a origem do lead (ex.: "vim do instagram" → Instagram).
- **Linha do tempo do contato:** eventos dos atendimentos (aceito,
  transferido, reaberto, devolvido, finalizado), etiquetas e anotações.
- **Relatórios de venda** (só tickets finalizados): vendas feitas (com total
  e média de todas as vendas do filtro) e não feitas. Filtros por período,
  atendente e fila.
- Valor da venda no formato brasileiro (`1.500,00`). O admin corrige a venda,
  e o motivo precisa ser da própria empresa.

### Produtos
- Nome obrigatório; tipo `valor_unico` (padrão), `recorrente` ou `sem_valor`
  (este nunca tem preço). Nasce ativo.
- O atendente vê o catálogo pelo atendimento.

### Cupons
- Código de até 50 caracteres, guardado em maiúsculas e único por empresa.
- Tipos: `percentual` (1 a 100), `fixo` (maior que zero), `frete_gratis` e
  `brinde` (com descrição). Valor mínimo de venda opcional.
- "Liberado para atendentes": qualquer atendente oferece; senão, só se o
  cliente já chegar com o código.
- Trocar o tipo sem mandar valor novo apaga o valor antigo.

### Relatórios
- Só admin. Por usuário e tempo médio olham só os últimos 90 dias.
- **Por usuário:** todos os usuários, com os tickets finalizados por cada um.
- **Por cliente:** tickets de cada contato no período (sem período: hoje);
  homônimos ficam separados.
- **Tempo médio** por dia: até o primeiro atendimento e até o primeiro
  encerramento de cada ticket (transferência e reabertura não contam).
- Download em Excel ou PDF.

---

## 4. Automação e envios

### Bots
- Gatilho, palavras-chave, conexão, tempo de resposta (1 a 1440 min),
  horário de funcionamento, fuso e mensagens de fora do horário e de saída.
  Nasce inativo.
- Um bot padrão por empresa; quem responde é o padrão **e ativo**.
- Salvar o fluxo troca todos os nós de uma vez (ou nada muda). O nó
  "Transferir" só aponta para fila da própria empresa.
- Mídias dos nós: imagem, vídeo, áudio ou PDF, até 25 MB.
- Painel com execuções do dia, em andamento, com erro e dos últimos 7 dias.

### Campanhas
- Título, mensagem, data e ao menos uma conexão da empresa; contatos de
  outra empresa são descartados. O disparo é feito pelo microsserviço de
  campanhas.
- Sem resposta dele em 10 s: "Serviço de campanhas indisponível".
- **Textos de agendamento** cadastrados pela empresa (não há textos
  padrão) viram botões de "Texto rápido" no agendamento do atendimento.
- Empresa desativada: campanhas pausadas, sem retomar sozinhas.

### API de mensagens
- Uma chave por empresa, mostrada uma única vez; gerar outra derruba a
  anterior. Precisa de "mensagens via API" ligado e da empresa ativa.
- Só conexões da empresa; número com 10 a 15 dígitos; mensagem de até 4096
  caracteres. Todo envio feito fica registrado.
- Opcional: a mensagem entra na conversa do contato (ticket aberto ou um novo
  já fechado).
- O formato de erro é um contrato com os clientes e não muda.

---

## 5. Configuração e integrações

### Configurações gerais
- Uma por empresa, criada com os padrões no primeiro acesso. Todos leem; só
  admin altera; a mudança chega na hora para quem está com o sistema aberto.
- Mensagens automáticas (boas-vindas, encerramento, transferência), e-mails de
  aviso e limites. Exemplos: fechar tickets abertos após 24 h e pendentes após
  48 h, 5 atendimentos simultâneos por atendente e 10 XP por venda.
- Tudo ou nada: se algo for recusado, nada é gravado.
- Os intervalos de fechamento de tickets são usados pelo atendimento
  automático (seção 2).

### Integrações (Google Agenda)
- Uma conta Google por empresa, só o admin conecta. O link de autorização vale
  10 minutos e não pode ser reaproveitado por outra empresa.
- Falha no Google nunca impede a agenda. Se o acesso for revogado, aparece o
  aviso **Reconectar** e o sistema para de tentar até lá.

### Agenda
- Título, início e término (término não antes do início); pode ser ligado a
  um lead e a filas.
- Lista o que **começa** no período (sem período: o mês atual).
- Com o Google conectado, criar, editar e apagar refletem no Google Agenda.

### Conquistas
- Gamificação ligada por padrão (o admin pode desligar).
- Seis missões; a patente vem do número de missões concluídas (Aprendiz,
  Explorador, Aventureiro, Mestre). Mestre sobe um nível a cada 10
  atendimentos fechados.
- Só o admin conclui missões. XP vem das vendas fechadas.

---

## 6. Canais de WhatsApp e infraestrutura

### WhatsApp Oficial (Cloud API da Meta)
- O admin conecta um número com as credenciais da Meta (ID do telefone, ID
  da conta WABA e token). O número é registrado na Cloud API, e o nome
  verificado vira o nome da conexão quando nenhum é informado.
- **Um número fica numa empresa só.** Conectar de novo na mesma empresa
  atualiza a conexão; um número de outra empresa é recusado (`409`).
- O token da Meta nunca sai da API.
- **Templates** (obrigatórios para falar com o cliente fora da janela de
  24 h): o admin cria e exclui (padrão `pt_BR`, categoria `UTILITY`). Qualquer
  usuário da empresa lista e envia, para um número de 10 a 15 dígitos. Recusa
  da Meta → `422` com a mensagem dela.
- **Webhook da Meta:** com `WAB_APP_SECRET` configurado, só aceita evento
  assinado pela Meta. Responde na hora e fica fora do limite de requisições.
- **Mensagem recebida:** entra no atendimento como nas outras conexões
  (contato, ticket, pesquisa pendente, bot). A origem do ticket é o anúncio
  que trouxe o cliente, ou "WhatsApp Oficial". Mídia é baixada da Meta e
  guardada no R2. Repetida ou com mais de 24 h é ignorada.
- **Status de entrega** (enviada, entregue, lida) atualiza a mensagem sem
  voltar atrás; falha de entrega vai para o log de erros da conexão.
- O texto do atendimento sai pela Cloud API quando a conexão é oficial.


### Tempo real (socket)
- A conexão exige o login (token de acesso). Sessão encerrada (logout,
  revogação, empresa desativada) ou token inválido não conecta.
- Cada pessoa entra sozinha só nas próprias salas: a da empresa (eventos de
  tickets, mensagens, contatos, configurações, filas) e a pessoal
  (notificações, tarefas). Ninguém escolhe sala.
- "Online" é quem tem ao menos uma aba conectada. Isso é usado na
  distribuição automática e no "transferir só para usuários online".
- O front renova o token e reconecta sozinho quando ele vence.

- `/metrics` exige o `METRICS_TOKEN`; em produção, sem ele, fica fechado.
- Alertas do Grafana chegam por WhatsApp (até 5 por mensagem) a um telefone
  configurado; o webhook exige token.
- Painel do superAdmin: CPU, memória, sessões de WhatsApp (total e por
  conexão, relidas do banco a cada coleta) e requisições/erros por minuto,
  em 1 h, 24 h ou 7 dias.

### WuzAPI
- Motor de WhatsApp alternativo ao bays, escolhido **por conexão**; os dois
  convivem sem disputar o mesmo número.
- Webhook assinado; as mensagens seguem o mesmo fluxo das do bays.
- Só marca a conexão como caída quando exige ação humana (logout, banimento,
  QR vencido).
- O status mostrado é o da WuzAPI: estados de espera ("Aguardando...") são
  sempre confirmados com ela, então o card não fica preso se um aviso se
  perder. Conexão que a WuzAPI não conhece conta como desconectada.

---

## Pontos em aberto (decisões pendentes)

### Segurança
- **Webhook da API Oficial sem `WAB_APP_SECRET`** (como hoje em produção)
  aceita eventos de qualquer origem: dá para forjar mensagens recebidas numa
  conexão oficial. Basta configurar o segredo do app da Meta.
- Ao registrar um número na Cloud API, o PIN da verificação em duas etapas
  é sempre `123456`.
- Tokens da Meta guardados sem criptografia no banco.
- Quem já está com o socket aberto continua recebendo eventos depois de um
  logout em outro aparelho ou de uma revogação, até a conexão cair (a
  reconexão é recusada).
- Tokens do Google guardados sem criptografia no banco.
- Mídias e fotos abrem sem login para quem tem o endereço.
- Foto de perfil aceita qualquer arquivo declarado como imagem.
- O HTML das mensagens automáticas não é filtrado.
- 2FA só para o superAdmin.
- Um token de renovação roubado e reutilizado não derruba as outras sessões.
- Não existe "esqueci minha senha".

### Regras de negócio para decidir
- **Atendente edita e apaga** mensagens rápidas, etiquetas e regras da empresa
  inteira, e agendamentos de outros. Deveria ser só do admin?
- **A empresa pode ficar sem admin** (um admin pode rebaixar a si mesmo).
- O catálogo do atendimento mostra produtos inativos.
- Cupons ainda não são aplicados em lugar nenhum. Também falta decidir: frete
  grátis guarda valor e o desconto fixo não é comparado ao mínimo.
- **Avisos e lembretes da agenda não existem** (são gravados, mas ninguém é
  avisado). Também falta tela para editar ou apagar agendamentos.
- Missões das conquistas são declaradas pelo front, e o atendente nunca
  evolui.
- Pesquisa pendente nunca expira: um "1" dias depois vira resposta.
- O menu do bot fica em silêncio quando o contato escolhe uma opção que não
  existe.
- Mídia, enquete e cartão de contato enviados pelo bot não entram no
  histórico.
- O tarefeiro é só pessoal: o gestor não atribui tarefas, e o prazo não avisa
  ninguém.
- **Relatórios e CRM calculam datas em UTC** (vendas depois das 21h de
  Brasília caem no dia seguinte), e o período usa a última atualização do
  ticket, não a data da venda.
- Palavra-chave de etiqueta casa dentro de outras palavras ("par" pega
  "parabéns").
- Template enviado pela API Oficial não aparece na conversa do contato.
- Bots e mensagens agendadas não usam a "resposta por outro número": saem
  sempre pela conexão de origem.
- Cliente que responde num ticket aberto há mais de X horas tem o ticket
  fechado no ciclo seguinte (com despedida), e a próxima mensagem dele abre
  outro ticket.

### Técnico / infraestrutura
- **Mídia, cartão de contato e enquete por conexão oficial falham**: só o
  texto sai pela Cloud API; o resto vai para o bays (a tratar no módulo
  whatsapp).
- O token de verificação do webhook oficial é lido de
  `WAB_WEBHOOK_VERIFY_TOKEN` (padrão `kelmor`), mas o ambiente de produção
  tem `META_WEBHOOK_VERIFY_TOKEN`, que não é usado.
- Token da Meta vencido não marca a conexão oficial como desconectada; os
  envios só passam a falhar.
- O front não mostra o status de entrega (enviada/entregue/lida) nem escuta
  esse aviso.
- A lista de templates traz no máximo 100.
- **Ninguém coleta métricas no cluster k3s** desde a migração de 02/11: o
  painel Monitoramento está sem dados novos.
- **O socket não é compartilhado entre réplicas.** Aviso na hora, "quem está
  online" e a distribuição automática podem ignorar quem está conectado em
  outra réplica da API. Resolve com o adaptador Redis do Socket.IO.
- Sem índice no banco garantindo uma integração Google por empresa.
- A migração órfã `drizzle/0011_campanhas.sql` pode ser apagada.
- Agendamento que falha não tem nova tentativa automática.
- Envios que falham pela API de mensagens não ficam registrados.
- **Quando uma conexão do bays cai por logout ou bloqueio (401/403), as
  credenciais de todas as conexões do bays são apagadas**, não só as da que
  caiu (código antigo; a tratar no módulo whatsapp).
- WuzAPI: áudio fora de Opus/OGG e figurinhas fora de webp podem falhar.
  Trocar o motor de uma conexão ainda é manual.
