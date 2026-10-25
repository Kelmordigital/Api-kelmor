# Integrações — Google Calendar

Conecta a empresa a uma conta Google para que os agendamentos do sistema
apareçam também no Google Calendar dessa conta.

**Rotas:** `/api/v1/integracoes/google` — `GET /auth-url` (inicia a conexão),
`GET /callback` (retorno do Google), `GET /status`, `DELETE /` (desconecta).

## Regras

- **RN-INT-01 — A integração é da empresa.** Cada empresa tem no máximo uma
  conta Google conectada, usada por todos os agendamentos dela. O superAdmin
  (que não pertence a uma empresa) não conecta.
- **RN-INT-02 — Só admin gerencia.** Iniciar a conexão, ver o status e
  desconectar são exclusivos de `admin`/`superAdmin` da empresa.
- **RN-INT-03 — Fluxo de conexão.** O admin pede a URL de autorização, é
  levado ao Google, autoriza o acesso à agenda e ao e-mail, e o Google o
  devolve ao sistema, que volta para a tela de Integrações do front.
- **RN-INT-04 — Conexão segura.** A URL de autorização carrega um
  identificador assinado da empresa que vale 10 minutos. Um retorno com
  identificador inválido, forjado ou vencido é recusado e nada é gravado (isso
  impede alguém de ligar a própria conta Google na empresa de outro).
- **RN-INT-05 — Resultado da conexão.** O front recebe
  `?connected=true` ou `?error=<motivo>`:

  | Motivo | Quando |
  |---|---|
  | `access_denied` | o usuário cancelou na tela do Google |
  | `missing_params` | o retorno veio sem os dados do Google |
  | `invalid_state` | identificador da empresa inválido ou vencido (RN-INT-04) |
  | `oauth_failed` | o Google recusou a autorização ou houve outra falha |

- **RN-INT-06 — Reconectar substitui.** Conectar de novo troca a conta e os
  tokens; não cria uma segunda integração. Se o Google não devolver um novo
  token de renovação, o anterior é mantido.
- **RN-INT-07 — Acesso contínuo.** O sistema pede acesso "offline" e renova
  sozinho o token de acesso quando faltar menos de 1 minuto para ele vencer.
- **RN-INT-08 — Status.** Mostra se a empresa está conectada, com qual e-mail
  do Google e se precisa reconectar (`needs_reconnect`).
- **RN-INT-09 — Desconectar.** Apaga a integração da empresa (tokens
  inclusive). Desconectar sem estar conectado não é erro.
- **RN-INT-10 — Sincronização nunca bloqueia a agenda.** Criar, editar ou
  apagar um agendamento funciona mesmo se o Google estiver fora do ar, se a
  empresa não tiver integração ou se o acesso tiver sido revogado. A falha é
  registrada no log e o agendamento interno vale normalmente.
- **RN-INT-11 — Aviso para reconectar.** Quando o Google recusa o acesso da
  empresa (acesso revogado na conta Google, senha trocada, permissão da agenda
  retirada, token de renovação vencido), a integração fica marcada como
  "precisa reconectar":
  - o admin vê um aviso com botão **Reconectar** no topo das telas de
    Integrações e da Agenda, e o card do Google Agenda troca o selo
    "Conectado" por "Reconectar";
  - o sistema para de tentar falar com o Google até a reconexão;
  - reconectar limpa o aviso e a sincronização volta para os próximos
    agendamentos.
  Falhas passageiras (Google fora do ar, rede) **não** geram o aviso.

## Validações e mensagens

| Situação | Status | Mensagem |
|---|---|---|
| Usuário sem empresa (superAdmin) | 403 | `Empresa não encontrada` |
| Atendente | 403 | `Acesso exclusivo para administradores.` |
| Sem login (exceto no callback) | 401 | — |

## Pontos em aberto

- **Agendamentos feitos enquanto precisava reconectar** não são enviados ao
  Google depois da reconexão.
- O aviso aparece só dentro do sistema (telas de Integrações e Agenda); não há
  e-mail nem notificação para o admin.
- **Desconectar não revoga no Google.** Os tokens são apagados do sistema, mas
  o app continua listado como autorizado na conta Google até o usuário
  remover por lá.
- **Tokens guardados sem criptografia** no banco.
- **Sem garantia no banco de uma integração por empresa.** A regra RN-INT-01
  é garantida pelo código; dois retornos simultâneos do Google poderiam criar
  duas linhas. Resolver com um índice único `(company_id, provider)`, o que
  exige migração.
- Eventos criados antes de conectar não são enviados ao Google; só os
  agendamentos criados com a integração ativa são sincronizados.

## Mudanças na refatoração

- Acesso revogado aparecia como "conectado" e a sincronização falhava em
  silêncio. Agora o admin é avisado (RN-INT-11). Exige a migração
  `drizzle/0040_integration_reconnect_required.sql` (coluna nova e opcional
  `reconnect_required_at`), aplicada automaticamente quando a API sobe.

- Quando a renovação do token falhava (acesso revogado), criar ou editar um
  agendamento respondia `500`, embora o agendamento já tivesse sido gravado.
  Agora a falha fica só no log (RN-INT-10).
- Cancelar na tela do Google voltava com `error=missing_params`; agora volta
  com `error=access_denied`.
- O token passa a ser renovado 1 minuto antes de vencer (antes, só depois de
  vencido, o que podia falhar no meio de uma chamada).
- Reconexão sem novo token de renovação falhava ao gravar; agora mantém o
  anterior (RN-INT-06).

## Código e testes

- `src/modules/integracoes/integracao.service.ts` — conexão, status, tokens.
- `src/modules/integracoes/calendar-sync.ts` — porta `CalendarSync` usada pela
  agenda; trocar de provedor (ex.: Outlook) é uma nova implementação dela.
- `src/modules/integracoes/google.gateways.ts` — único arquivo que fala com o
  Google.
- `tests/modules/integracoes.test.ts` (API) e
  `tests/unit/google-calendar-integration.test.ts` (fluxo OAuth e
  sincronização com o Google simulado).
