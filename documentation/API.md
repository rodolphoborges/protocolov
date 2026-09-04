# API.md // PROTOCOLO V

## 1. Integrações Externas

### HenrikDev API (V1, V2, V3, V4)
O projeto consome a API oficial da HenrikDev como fonte primária de telemetria do Valorant.

- **Base URL**: `https://api.henrikdev.xyz/valorant/`
- **Autenticação**: Header `Authorization: <HENRIK_API_KEY>`

#### Endpoints Utilizados:
1. **Perfil e Nível de Conta**:
   - `GET /v1/account/{name}/{tag}`
   - Retorna: Nível da conta (`account_level`), banner (`card.small`), e região (`region`). Usado para descobrir a região de agentes e no alistamento.
2. **MMR e Ranks Competitivos**:
   - `GET /v2/mmr/{region}/{name}/{tag}`
   - Retorna: Rank atual (`currenttier`, `currenttierpatched`), elo/ranking points e pico histórico (`highest_rank.tier`, `highest_rank.patched_tier`, `highest_rank.season`).
3. **Partidas Recentes (Competitivo & Mata-Mata)**:
   - `GET /v3/matches/{region}/{name}/{tag}?mode=competitive&size=5`
   - `GET /v3/matches/{region}/{name}/{tag}?mode=deathmatch&size=10`
   - Retorna lista de partidas recentes, agentes jogados, squads presentes e placares.
4. **Telemetria Aprofundada da Partida**:
   - `GET /v4/match/{region}/{matchId}`
   - Retorna metadados completos por round, KAST, ADR, dano por zona e abates para processamento no Oráculo V.
   - Script de teste: `node scripts/api/probe_api_v4.js [type] [matchId]`

#### Roteamento Dinâmico Multi-Região:
- O sistema resolve a região do agente dinamicamente através do campo `region` em `players` ou auto-detecta via `v1/account`.
- Regiões suportadas: `br`, `na`, `latam`, `eu`, `ap`, `kr`.
- Fallback automático para `br` caso a região não esteja explicitamente cadastrada.

### Telegram Bot API
- **Biblioteca**: `node-telegram-bot-api`
- **Comandos Principais**:
  - `/start`: Inicia a interface de comando e boas-vindas tática.
  - `/radar`: Verifica o status operacional dos sistemas e prontidão dos agentes.
  - `/meu_id`: Retorna o Telegram ID do operador (necessário para atribuição de admin).
  - `/vincular [RiotID]`: Cadastra ou atualiza o vínculo do jogador com sincronização instantânea de elo, rank máximo e card.
  - `/convocar`: Inicia protocolo de convocação de esquadrão com botões interativos (LFG).
  - `/analisar [MatchID]`: Solicita análise tática profunda ao Oráculo V para uma partida específica.

---

## 2. Ponte de Comunicação com o Oráculo-V

### Enfileiramento de Briefings:
- **Endpoint**: `POST ${ORACULO_API_URL}/api/queue`
- **Headers**: `Content-Type: application/json`, `x-api-key: ${ORACULO_API_KEY}`
- **Padrão**: *Fire-and-forget* com timeout estrito de 3 segundos (retorna HTTP 202 Accepted).
- **Fallback de Indisponibilidade**: Se a API REST do Oráculo falhar ou estiver offline, o briefing é persistido na tabela local `match_analysis_queue` com backoff exponencial (5m → 15m → 60m).

### Retorno de Insights (Webhook Callback):
- **Endpoint**: `POST ${PROTOCOLO_API_URL}/api/insights/callback`
- **Persistência**: Grava o relatório tático na tabela `ai_insights` e dispara notificação via rádio do Telegram para o clã.

---

## 3. Gestão de Credenciais, Resiliência e Rate-Limiting

### Configuração de Ambiente (`.env`)
- `SUPABASE_URL` / `SUPABASE_SERVICE_KEY`: Instância principal do Protocolo V.
- `ORACULO_API_URL` / `ORACULO_API_KEY`: Endereço e chave da API REST do Oráculo V.
- `HENRIK_API_KEY`: Chave de autenticação da HenrikDev.
- `TELEGRAM_BOT_TOKEN`: Token de autenticação do bot no Telegram.
- `ADMIN_TELEGRAM_ID`: ID numérico do administrador para alertas críticos.

### Resiliência e Retentativas (HTTP 429)
- `services/api-client.js` gerencia chamadas HTTP com proteção contra rate-limits.
- Em caso de resposta HTTP 429, o cliente aplica delay adaptativo (`retry-after` header ou cálculo exponencial com *jitter* randômico).
- Erros de agente fantasma (HTTP 404) marcam `is_ghost: true` para quarentena sem interromper o ciclo geral de sincronização.

---

## 4. Estrutura de Dados do Supabase

### Tabelas Primárias:
- **`players`**:
  - `riot_id` (PK, text): Nome e tag normalizados (ex: `mwzeraDaShopee#s2s2`).
  - `region` (text): Região do servidor Riot (`br`, `na`, etc.).
  - `current_tier` (int): ID numérico do tier (0 a 27).
  - `current_tier_name` (text): Nome do rank atual (ex: `Ascendente 2`).
  - `current_rank_icon` (text): URL do ícone de elo atual.
  - `peak_tier_name` (text): Maior rank histórico atingido.
  - `peak_rank_icon` (text): URL do ícone do rank máximo.
  - `level` (int): Nível de conta no Valorant.
  - `card_url` (text): Banner cosmético do jogador.
  - `synergy_score` (int): Pontos de entrosamento em squads do clã.
  - `dm_score` (int): Pontos de Mata-Mata da semana atual (reset às segundas 00:00 UTC).
  - `dm_score_monthly` (int): Pontos de Mata-Mata do mês corrente (reset dia 1º 00:00 UTC).
  - `dm_score_total` (int): Pontuação vitalícia acumulada de Mata-Mata.
  - `dm_wins` (int) / `dm_matches` (int): Total de vitórias e volume de treinos.
  - `unit` (text): Unidade tática (`ALPHA`, `OMEGA`, `WINGMAN`).
  - `performance_l` / `performance_t` (float): Nível e tendência pelo modelo Holt-Winters.
  - `tracker_link` (text): Link direto para o perfil do Tracker.gg.

- **`operations`**:
  - `id` (PK, uuid): ID global da partida (Riot Match ID).
  - `map_name` (text): Nome do mapa da operação.
  - `team_score` (int) / `enemy_score` (int): Placar estritamente orientado ao esquadrão do clã (`ourScore - enemyScore`).
  - `team_color` (text): Cor original na API Riot (`Blue` ou `Red`).
  - `is_competitive` (boolean): Flag de partida competitiva.
  - `match_date` (timestamp): Data e hora da operação.

- **`operation_squads`**:
  - `operation_id` (FK, uuid), `player_id` (FK, text), `agent` (text), `kills` (int), `deaths` (int), `assists` (int), `score` (int).

- **`match_analysis_queue`**:
  - Fila local de retentativas para despacho de análises ao Oráculo V.

