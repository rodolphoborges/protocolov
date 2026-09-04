# PROJECT_CONTEXT.md // PROTOCOLO V

## 1. Visão Geral e Arquitetura
O **Protocolo V** é uma plataforma de inteligência e gestão tática para o clã de Valorant, operando sob uma estética de "Terminal/Cyberpunk" (K.A.I.O. // Oráculo V). O ecossistema centraliza dados de performance, telemetria de combate, sinergia de esquadrões, ranking de Mata-Mata e automação operacional.

### Stack Tecnológica
- **Backend & Core Engine**: Node.js (Express) executando rotinas de sincronização, cron jobs e o Bot do Telegram (`src/telegram-bot.js`).
- **Portal Tático de Produção (`docs/`)**: Interface oficial em produção servida via GitHub Pages (`https://protocolov.com`), desenvolvida em Vanilla JavaScript moderno (ES6+), HTML5 semântico e CSS3 com tema Cyberpunk/Teko.
- **Frontend Experimental (`frontend/`)**: Single Page Application (SPA) em React 19 com Vite 8 e React Router 7 (scaffold para futura expansão administrativa).
- **Banco de Dados**: Supabase (PostgreSQL) com Row Level Security (RLS).
- **Arquitetura de Serviços**:
    - `services/api-client.js`: Abstração de rede com headers customizados e tratamento de rate-limiting (HTTP 429) com retry exponencial e jitter.
    - `services/synergy-engine.js`: Motor de cálculo de pontos de sinergia do clã, detecção de esquadrões (duos a 5-stacks) e normalização de placar (`ourScore - enemyScore`).
    - `services/notifier.js`: Sistema de alertas descentralizado (Telegram/Logs).
    - `services/player-worker.js`: Gerenciador de perfis com resolução dinâmica de região (`br`, `na`, `latam`, `eu`), mapeamento de 28 tiers competitivos e extração de ícones de pico.
    - `src/cron/reset-dm.js`: Rotina agendada para expurgo de placares de Deathmatch semanal (segundas-feiras) e mensal (dia 1º).

### Estrutura de Diretórios
- `src/`: Core Engine (`telegram-bot.js`, `update-data.js`, `db.js`, `cron/`).
- `update-data.js`: Wrapper de compatibilidade na raiz que delega para `src/update-data.js`.
- `docs/`: Portal tático web oficial em produção (`protocolov.com` via GitHub Pages).
- `frontend/`: Scaffold experimental React 19.
- `scripts/`: Utilitários de manutenção (`maintenance/fix-inverted-scores.js`, `maintenance/clean-solo-ops.js`, `api/probe_api_v4.js`).
- `services/`: Módulos de lógica desacoplada (Engine, Notifier, Workers).
- `tests/`: Suíte de testes automatizados (Jest).
- `documentation/`: Documentação técnica completa do sistema.

## 2. Fluxo de Dados

1. **Ingestão Automatizada Staggered (GitHub Actions)**:
   - Os workflows `update.yml` (minutos :00 e :30) e `sync_matches.yml` (minutos :15 e :45) alternam a cada 15 minutos.
   - Consomem a API da HenrikDev (v1, v2, v3, v4) com suporte a multi-região para extrair partidas competitivas e de Mata-Mata.
   - Atualizam elos competitivos (28 tiers), ícones de pico, níveis de conta e banners de perfil.
   - Calculam pontos de **Sinergia** do clã e registram operações na tabela `operations` com placar orientado ao time.
   - Alimentam os rankings de Deathmatch (`dm_score` semanal, `dm_score_monthly`, `dm_score_total`).

2. **Análise Profunda (Oráculo V)**:
   - Após a ingestão de novas partidas, o sistema despacha briefings de combate para o Oráculo V via REST (`POST /api/queue`).
   - A chamada é **fire-and-forget** com timeout de 3 segundos (HTTP 202).
   - Se o Oráculo estiver offline, o briefing é salvo localmente em `match_analysis_queue` para retry automático.
   - Falhas na análise **não afetam** o resultado do sync.
   - O worker do Oráculo gera relatórios com **Performance Index** (Role-Aware), classificação em três ranks técnicos (Alpha/Omega/Depósito de Torreta) e Heurística K.A.I.O.

3. **Interface de Controle (Telegram)**:
   - O `src/telegram-bot.js` atua como rádio e HUB de comando, permitindo alistamento (`/vincular`), convocação de esquadrões (`/convocar`), radar operacional (`/radar`) e disparo de análises manuais (`/analisar`).

4. **Portal Tático Web (`docs/`)**:
   - `index.html`: Dashboard operacional com status de prontidão, elos, cards por unidade e feed "Últimas Operações" (apenas jogos em squad do clã).
   - `treino.html`: Leaderboard de Mata-Mata com abas Semanal, Mensal e Geral.
   - `historico.html` & `analise.html`: Histórico detalhado de confrontos e relatórios táticos de IA.

## 3. Diretrizes de Qualidade e Manutenção

> [!NOTE]
> **Orientação de Placar**: Todas as operações do clã na tabela `operations` seguem a regra estrita `ourScore - enemyScore`. O primeiro número é sempre a pontuação do esquadrão do clã, mesmo que a Riot classifique o esquadrão como Red Team.

> [!IMPORTANT]
> **Integridade de Dados (Ghost Protocol)**: O sistema valida o alistamento via API e sinaliza agentes que retornam 404 (`is_ghost: true`), protegendo o banco contra nicks inexistentes ou deletados na Riot.

> [!TIP]
> **Manutenção e Recuperação**: Em caso de inatividade de 60 dias no repositório, os workflows do GitHub Actions podem ser pausados automaticamente pela plataforma. Para reativar, acesse a aba *Actions* e confirme o re-enablement, ou rode manualmente `npm run sync`.

