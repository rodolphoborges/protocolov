# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Protocolo-V is the **Data Owner** of the Valorant tactical ecosystem. It manages player identities, squad operations, and acts as the primary user interface via a Telegram bot. Written in Node.js (CommonJS).

## Commands

```bash
npm start              # Express API + Telegram bot (src/telegram-bot.js)
npm run sync           # Force data sweep from HenrikDev API (src/update-data.js)
npm test               # Jest test suite
cd frontend && npm run dev  # React 19 + Vite 8 dev server (scaffold, not functional yet)
```

### Maintenance scripts (`scripts/`)
```bash
node scripts/maintenance/reset-dm.js   # Reset direct message state
# Other scripts in scripts/api/, scripts/debug/, scripts/diagnostics/, scripts/utils/
```

## Architecture

### Entry Point
`src/telegram-bot.js` is the main entry point — it boots both the Telegram bot AND an Express server in a single process. The Express server handles:
- `/` and `/vanguard-health` — health checks
- `/bot{token}` — Telegram webhook (if `WEBHOOK_URL` is set, otherwise uses polling)
- `/api/insights/callback` — receives analysis results from Oraculo-V (auth via `x-api-key`)

### Key Source Files (`src/`)
- `telegram-bot.js` — Bot commands, callback handlers, Express server (single large file ~500 lines)
- `db.js` — Dual Supabase client: own DB (`supabase`) + optional Oraculo DB (`oraculo`) for direct queue queries
- `update-data.js` — HenrikDev API sweep, finds new competitive matches for all registered players
- `oraculo.js` — Fetches detailed match data from HenrikDev V4 API
- `auto-unidades.js` — Automatic unit assignment logic

### Services (`services/`)
- `oraculo-service.js` — REST client for sending briefings to Oraculo-V's `/api/queue`
- `player-worker.js` — Player profile operations (fetch, create, update)
- `synergy-engine.js` — Squad synergy point calculations
- `match-briefing.js` — Packages match data into tactical briefing format
- `notifier.js` — Telegram notification dispatching
- `achievements.js` — Player achievement tracking
- `api-client.js` — Shared HTTP client utilities

### Frontend (`frontend/`)
React 19 + Vite 8 scaffold. Not functional yet — dashboard pages and components still need implementation.

## Module System

**CommonJS** — uses `require()` / `module.exports`. Do not use ES module syntax (`import`/`export`).

## Database (Supabase)

Tables: `players`, `operations`, `operation_squads`, `ai_insights`.

The `db.js` file exports two clients:
- `supabase` — main Protocolo-V database (required)
- `oraculo` — optional direct access to Oraculo-V's database (for queue status queries). This is a legacy coupling — the goal is to remove it in favor of REST calls.

## Telegram Bot Patterns

- Bot commands are registered via `bot.onText(/\/command/, handler)` in `telegram-bot.js`
- Inline callbacks follow naming conventions: `lfg_join_*`, `uni_*`, `cvc_*`
- Admin commands check `msg.from.id === ADMIN_ID`
- Use `escapeMarkdown()` when sending user-provided text in Markdown messages
- Bot mode depends on `WEBHOOK_URL`: set = webhook mode, absent = polling mode

## HenrikDev API Usage

Three API versions used simultaneously:
- **V1**: Account verification during `/vincular` (telegram-bot.js)
- **V3**: Match history by player (update-data.js)
- **V4**: Detailed match data by match ID (oraculo.js)

Rate limiting is configured in `settings.json` (15s base delay, 4s jitter, 20s timeout). Respect these limits — HenrikDev has strict rate caps.

## Tests

Jest tests live in `tests/`. Test files: `bot.test.js`, `updater.test.js`. Mock directory: `tests/mocks/`.

Run with `npm test` (uses default Jest config).

## Environment

Copy `.env.example` to `.env`. Critical vars: `TELEGRAM_BOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `HENRIK_API_KEY`, `ADMIN_TELEGRAM_ID`. See `.env.example` for full list.
