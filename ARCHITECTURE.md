# Arquitetura Global: Ecossistema Protocolo-V & Oraculo-V

**Data de Atualizacao:** 03/09/2026
**Status:** Producao — Ativo (Portal GitHub Pages + Bot Telegram + Ingestao Staggered)

Este documento descreve a arquitetura geral do ecossistema e como os servicos e portais interagem.

---

## 1. Visao Geral dos Dominios

O ecossistema adota uma arquitetura orientada a servicos (SOA) e modular, dividindo responsabilidades entre dois sistemas principais e uma interface web de producao:

### 1.1 Protocolo-V (Data Owner & Hub Central)
Responsavel por gerir a "verdade" dos utilizadores e das operacoes de combate.
- **Identidade e Guilda**: Gere Riot IDs, vinculos com o Telegram, unidades taticas (ALPHA, OMEGA, WINGMAN) e rankings de sinergia e Mata-Mata.
- **Ingestao e Roteamento Multi-Regiao**: Varre ativamente a Riot Games via HenrikDev API (v1, v2, v3, v4) com resolucao dinamica de regiao (`br`, `na`, `latam`, `eu`, `ap`, `kr`).
- **Contrato de Decisao**: Avalia quando e necessario invocar os servicos de IA e empacota a operacao num Briefing Tatico padronizado.
- **Bot Telegram**: Interface de comunicacao e comando para os membros (comandos `/radar`, `/convocar`, `/vincular`, `/analisar`, notificacoes).
- **Express Server**: Embutido no `telegram-bot.js`, expoe endpoints REST para health checks e recebimento de callbacks do Oraculo.
- **Automacao Staggered (GitHub Actions)**: Ingestao continua e balanceada a cada 15 minutos via dois workflows complementares (`update.yml` aos :00 e :30, `sync_matches.yml` aos :15 e :45).

### 1.2 Oraculo-V (Service Provider & IA)
Responsavel pela forca computacional bruta e geracao de insights baseados em dados de combate.
- **Motor Matematico (JS Nativo)**: Computa Performance Index e projecoes Holt-Winters. Escrito exclusivamente em JavaScript (Node.js), substituindo o antigo motor Python.
- **Tribunal Engine**: Motor LLM adversarial com 3 personas (Aliado, Rival, Mentor K.A.I.O.) para coaching tatico.
- **Processamento Assincrono**: Gere a sua propria fila (`match_analysis_queue`) e ciclo de vida de jobs.
- **Cadeia de Fallback LLM**: Groq -> OpenRouter -> Ollama local.

### 1.3 Portal Tatico Web (`docs/` — protocolov.com)
Interface publica de producao hospedada via GitHub Pages (Custom Domain `protocolov.com`).
- **Arquitetura Client-Side**: SPA estatica (Vanilla JavaScript ES6+, HTML5 semantico, CSS3 Cyberpunk/Teko responsivo) que se comunica diretamente com o Supabase via chave anonima publica protegida por RLS.
- **Paginas Ativas**:
  - `index.html`: Dashboard principal com cards de agentes, status operacional, squads Alpha/Omega/Wingman e secao "Ultimas Operacoes" do cla.
  - `treino.html`: Leaderboard de Mata-Mata / Deathmatch (filtros Semanal, Mensal, Geral), metricas de pontuacao, volume de partidas e taxa de vitorias.
  - `historico.html`: Historico cronologico de operacoes competitivas com filtros de mapa, resultado e agentes.
  - `analise.html`: Insights táticos e relatorios gerados pelo Oraculo-V.
  - `admin.html`: Painel operacional para gestao de agentes, logs e auditoria.
- **Frontend Experimental (`frontend/`)**: Scaffold React 19 + Vite 8 reservado para futuro dashboard administrativo avancado.

---

## 2. Padroes de Comunicacao e Resiliencia

### 2.1 Soberania de Dados e Webhooks (Modelo Ideal)

O modelo arquitetural planejado e baseado exclusivamente em REST APIs:

1. O **Protocolo-V** deteta uma nova operacao e envia `POST /api/queue` para o **Oraculo-V** (fire-and-forget com timeout de 3s).
2. O **Oraculo-V** aceita e enfileira no seu BD isolado (`match_analysis_queue`), retornando HTTP 202.
3. Quando a analise e concluida, o worker do **Oraculo-V** efetua callback HTTPS para `POST /api/insights/callback` no **Protocolo-V**.
4. O **Protocolo-V** persiste a analise e notifica o user via Telegram.

### 2.2 Realidade Atual: Acoplamento Parcial

> **Transparencia**: Apesar do objetivo de desacoplamento total via REST, o Protocolo-V **ainda mantem acesso direto** ao banco do Oraculo-V para algumas operacoes.

O arquivo `src/db.js` cria um cliente Supabase para o banco do Oraculo se `ORACULO_SUPABASE_URL` estiver configurado. Isso e usado para:
- Consultar o status da fila (`match_analysis_queue`) diretamente
- Buscar historico de analises do Oraculo

Este e um vestigio da arquitetura Dual-Database anterior. As consultas devem ser progressivamente migradas para chamadas REST ao endpoint `/api/status` do Oraculo.

### 2.3 Fallback de Persistencia (Oraculo -> Protocolo)

Se o webhook callback falhar, o Oraculo-V tenta persistir diretamente no banco do Protocolo-V (via `PROTOCOL_SUPABASE_URL`). Isso e um mecanismo de emergencia, nao o fluxo principal.

---

## 3. Orquestracao & Cron Jobs

### Rotinas Automatizadas (GitHub Actions & Crons)
- **`update.yml`**: Roda a cada hora nos minutos :00 e :30. Atualiza elos, ranks maximos, dados de jogadores e partidas.
- **`sync_matches.yml`**: Roda a cada hora nos minutos :15 e :45. Sincroniza operacoes de squads e atualiza pontos de sinergia.
- **`src/cron/reset-dm.js`**: Rotina agendada para zerar placares de Deathmatch (Mata-Mata):
  - **Semanal**: Toda segunda-feira as 00:00 UTC (`dm_score = 0`).
  - **Mensal**: Todo dia 1º do mes as 00:00 UTC (`dm_score_monthly = 0`).
  - Nota: `dm_score_total` nunca e zerado, servindo de historico vitalicio.

### Docker Compose (Raiz do Workspace)

O arquivo `docker-compose.yml` existe na raiz do workspace (`PROJETOS-V/`) e configura:
- **protocolov**: Porta 3000, depende do oraculov
- **oraculov**: Porta 3001, volume persistente para analises

```bash
cd PROJETOS-V
docker-compose up --build
```

---

## 4. Checklist de Marco Arquitetural

- [x] **Migracao do Motor Python -> JS**: `analyze_valorant.py` substituido por `lib/analyze_valorant.js`
- [x] **Tribunal Engine**: Motor LLM adversarial com 3 personas implementado
- [x] **Webhook Callback**: Oraculo envia resultados via REST para Protocolo
- [x] **Portal Tatico Web em Producao**: Interface completa em `docs/` (`protocolov.com`) com dashboard, DM leaderboard, historico e analises
- [x] **Roteamento Multi-Regiao**: Auto-deteccao de regiao via `v1/account` com fallback inteligente
- [x] **Mapeamento de 28 Tiers Competitivos**: Suporte a todos os elos do Valorant (Sem Rank a Radiante) com icones de pico
- [x] **Orientacao Consistente de Placar**: Normalizacao `ourScore - enemyScore` para operacoes do cla
- [ ] **Desacoplamento Total de BD**: Protocolo-V ainda acessa banco do Oraculo diretamente (migrar para REST)
- [ ] **Dockerfiles Individuais**: Criar Dockerfile dedicado para cada microsservico
- [ ] **Frontend Dashboard React**: Evoluir o scaffold em `frontend/` para substituir o painel administrativo

---

## 5. Tabelas de Banco de Dados

### Protocolo-V (Supabase)
| Tabela | Colunas Principais | Descricao |
|---|---|---|
| `players` | `riot_id` (PK), `tag`, `region`, `telegram_id`, `unit` (ALPHA/OMEGA/WINGMAN), `role_raw`, `current_tier`, `current_tier_name`, `current_rank_icon`, `peak_tier_name`, `peak_rank_icon`, `level`, `card_url`, `synergy_score`, `dm_score`, `dm_score_monthly`, `dm_score_total`, `dm_wins`, `dm_matches`, `performance_l`, `performance_t`, `tracker_link`, `last_scan_at`, `updated_at` | Cadastro completo de agentes, elos, rankings e telemetria |
| `operations` | `id` (PK UUID), `map_name`, `match_date`, `team_score`, `enemy_score`, `team_color`, `is_competitive`, `created_at` | Historico de partidas com pontuacao orientada (`ourScore - enemyScore`) |
| `operation_squads` | `operation_id` (FK), `player_id` (FK), `agent`, `kills`, `deaths`, `assists`, `score` | Desempenho individual de cada agente do cla na operacao |
| `ai_insights` | `match_id` (FK), `player_id` (FK), `insight_resumo`, `analysis_report`, `classification`, `created_at` | Cache local dos relatorios analiticos do Oraculo-V |
| `active_calls` | `id`, `host_id`, `required_role`, `status`, `created_at` | Convocacoes ativas de esquadrao via Bot Telegram |

### Oraculo-V (Supabase)
| Tabela | Descricao |
|---|---|
| `match_analysis_queue` | Fila de jobs para processamento de IA (pending/processing/failed) |
| `match_stats` | Stats persistidos de cada analise calculada pelo motor matematico |
| `ai_insights` | Insights detalhados gerados pelo Tribunal Engine LLM |

---
*Protocolo-V / Arquitetura Distribuida / Atualizado em 03/09/2026*

