# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Protocolo-V is the **Data Owner** of the Valorant tactical ecosystem. It manages player identities, squad operations, and acts as the primary user interface via a Telegram bot. Written in Node.js (CommonJS).

## Commands

```bash
npm start                       # Express API + Telegram bot (src/telegram-bot.js)
npm run sync                    # Force data sweep from HenrikDev API (src/update-data.js)
npm run maintenance:reset       # Reset weekly and monthly Deathmatch (Mata-Mata) scores
npm test                        # Jest test suite (updater.test.js, bot.test.js)
cd frontend && npm run dev      # React 19 + Vite 8 admin dev server (scaffold/experimental)
```

### Maintenance Scripts (`scripts/maintenance/`)
```bash
npm run maintenance:reset                    # Reset weekly (dm_score) and monthly (dm_score_monthly) Mata-Mata scores
node scripts/maintenance/fix-inverted-scores.js  # Normalize inverted scores (ourScore - enemyScore) in Supabase
node scripts/maintenance/clean-solo-ops.js    # Purge solitary matches lacking clan squad association
node scripts/maintenance/sync_queue.js       # Sync analysis queue with Oraculo-V
```

## Architecture

### Entry Point
`src/telegram-bot.js` is the main backend entry point — it boots both the Telegram bot AND an Express server in a single process. The Express server handles:
- `/` and `/vanguard-health` — health checks
- `/bot{token}` — Telegram webhook (if `WEBHOOK_URL` is set, otherwise uses polling)
- `/api/insights/callback` — receives analysis results from Oraculo-V (auth via `x-api-key`)

### Production Web Portal (`docs/` - GitHub Pages)
The primary live user-facing dashboard is hosted at `https://protocolov.com` via GitHub Pages from `docs/`:
- `index.html` — Main Tactical Command Center: Units (Alpha, Ômega, Depósito de Torretas/Wingman), recent joint operations debriefing, recruitment form.
- `treino.html` — Deathmatch (Mata-Mata) Leaderboard: Weekly, monthly, and all-time MVP podiums and contender rankings.
- `historico.html` — Full Match Archive: Advanced filters (map, result, agent, date range) and squad debriefs.
- `analise.html` — AI Tactical debriefing & player performance analysis.
- `admin.html` — Restricted squad roster management and telemetry.
- `config.js` — Client-side endpoint, social links, and unit configuration.
- `script.js` — Client data loader, DOM normalizer, and real-time Supabase connector.

### Experimental Frontend (`frontend/`)
React 19 + Vite 8 + React Router 7 experimental admin scaffold (optional development environment).

### Key Source Files (`src/`)
- `telegram-bot.js` — Bot commands, callback handlers, Express server
- `db.js` — Supabase client initialization (`supabase` primary + optional `oraculo` bridge)
- `update-data.js` — Core synchronization pipeline: scans HenrikDev API, computes synergy and Deathmatch scores, updates player profiles, and registers operations
- `oraculo.js` — Fetches detailed match data from HenrikDev V4 API
- `auto-unidades.js` — Automatic unit assignment logic

### Services (`services/`)
- `synergy-engine.js` — Calculates squad synergy points (Duo +1/2, Trio +2/4, 4+ +5/10), Deathmatch kill/podium bonuses (+15, +10, +5), generates deterministic UUIDs, and enforces team score orientation (`ourScore-enemyScore`)
- `player-worker.js` — Player profile fetcher and updater (supports 28 competitive tiers, dynamic multi-region detection `na`, `latam`, `br`, and peak rank icons)
- `oraculo-service.js` — REST client for sending briefings to Oraculo-V's `/api/queue`
- `match-briefing.js` — Packages match data into tactical briefing format
- `notifier.js` — Telegram notification dispatching
- `achievements.js` — Player achievement and streak tracking
- `api-client.js` — Shared HTTP client with exponential backoff and jitter for HenrikDev rate limits

## Module System

**CommonJS** — uses `require()` / `module.exports`. Do not use ES module syntax (`import`/`export`) in root or `src/`.

## Database (Supabase)

Tables:
- `players`: `riot_id` (PK), `current_rank`, `current_rank_icon`, `peak_rank`, `peak_rank_icon`, `level`, `card_url`, `unit` (`ALPHA`, `OMEGA`, `WINGMAN`), `role_raw`, `synergy_score`, `dm_score` (weekly), `dm_score_monthly`, `dm_score_total`, `last_match_id`, `api_error`, `lone_wolf`
- `operations`: `id` (UUID PK), `map_name`, `mode`, `score` (`ourScore-enemyScore`), `result` (`VITÓRIA`, `DERROTA`, `EMPATE`), `team_color`, `started_at`
- `operation_squads`: `operation_id` (FK), `riot_id`, `agent`, `agent_img`, `kda`, `hs_percent`
- `ai_insights`: `match_id`, `player_id`, `insight_resumo`, `analysis_report`

## Automated Workflows (GitHub Actions)

Scheduled pipelines in `.github/workflows/`:
- `update.yml`: Runs `npm run sync` on `:00` and `:30` of every hour.
- `sync_matches.yml`: Runs `node src/update-data.js` on `:15` and `:45` of every hour (staggered every 15 min to prevent rate-limit collisions).
- `reset-dm.yml`: Resets weekly Deathmatch scores every Monday and monthly scores on the 1st of each month.
- `e2e-tests.yml`: Continuous integration test runner.

> **Note on GitHub Actions Dormancy**: GitHub automatically pauses scheduled cron workflows after 60 days of repository commit inactivity. Pushing commits or clicking "Enable workflows" in the Actions tab reactivates them.

## HenrikDev API Usage

Three API versions used simultaneously:
- **V1**: Account verification & metadata (`/v1/account/{name}/{tag}`)
- **V2**: MMR and competitive tiers (`/v2/mmr/{region}/{name}/{tag}`)
- **V3**: Match history by player (`/v3/matches/{region}/{name}/{tag}`)
- **V4**: Detailed match data by match ID (`/v4/match/{region}/{matchId}`)

Rate limiting is configured in `settings.json` (15s base delay, 4s jitter, 20s timeout).

## Tests

Jest tests live in `tests/`:
- `bot.test.js` — Telegram bot command and interaction tests
- `updater.test.js` — Data ingestion, synergy calculations, score orientation (Red/Blue), and player profile updates

Run with `npm test`.

## Environment

Copy `.env.example` to `.env`. Critical vars: `TELEGRAM_BOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `HENRIK_API_KEY`, `ADMIN_TELEGRAM_ID`. See `.env.example` for full list.
