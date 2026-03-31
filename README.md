# PROTOCOLO V // K.A.I.O. — COMANDO CENTRAL

[![Atualiza Dados](https://github.com/rodolphoborges/protocolov/actions/workflows/update.yml/badge.svg)](https://github.com/rodolphoborges/protocolov/actions/workflows/update.yml)

> Centro de comando para recrutamento, gestao de esquadroes e ingestao de dados de combate do Valorant.
> Fonte unica da verdade para identidade de jogadores e operacoes do ecossistema.

---

## Arquitetura

O Protocolo V e o **Data Owner** do ecossistema. Ele controla:

- **Identidade**: Riot IDs, tags, ranks, metadados de perfil
- **Operacoes**: Formacao de squads, historico de partidas, sinergia
- **Despacho**: Envia briefings de combate para o [Oraculo V](../oraculo-v/) processar

### Fluxo de Dados

```
HenrikDev API (Riot Data)
      |
      v
update-data.js (GitHub Actions, a cada 30min)
      |
      |-- Busca ultimas partidas de cada jogador
      |-- SynergyEngine: calcula pontos de sinergia do squad
      |-- Upsert: players, operations, operation_squads
      |
      |-- [Competitivas] POST /api/queue -> Oraculo V
      |
      v
telegram-bot.js (Express + Telegram Bot)
      |
      |-- Comandos: /vincular, /ranking, /perfil, /convocar, /analisar
      |-- Notificacoes: Alpha, Deposito de Torreta, Lobo Solitario
      |-- Health check: GET /vanguard-health
      v
Frontend React (Vite) — Dashboard tatico
```

---

## Stack

| Camada | Tecnologia |
|---|---|
| **Runtime** | Node.js 18+ |
| **API** | Express 4 |
| **Bot** | node-telegram-bot-api |
| **Database** | Supabase (PostgreSQL) |
| **Frontend** | React 19, Vite 8, React Router 7, Lucide Icons |
| **Dados Riot** | HenrikDev API v3/v4 (partidas, MMR, ranks) |
| **Testes** | Jest |
| **CI/CD** | GitHub Actions (sync a cada 30min) |

---

## Setup

### Pre-requisitos
- Node.js v18+
- Conta no [Supabase](https://supabase.com/)
- API Key da [HenrikDev](https://henrikdev.xyz/dashboard)
- Token de Bot Telegram via [@BotFather](https://t.me/BotFather)

### Instalacao

```bash
git clone https://github.com/rodolphoborges/protocolov.git
cd protocolov
npm install
cp .env.example .env
```

### Variaveis de Ambiente

> **SEGURANCA**: O arquivo `.env` contem credenciais sensiveis (chaves Supabase, Riot ID, token Telegram). Nunca comite este arquivo. Use `.env.example` como template.

| Variavel | Obrigatoria | Descricao |
|---|---|---|
| `SUPABASE_URL` | Sim | URL do projeto Supabase |
| `SUPABASE_SERVICE_KEY` | Sim | Chave Service Role (nunca no client-side) |
| `HENRIK_API_KEY` | Sim | Chave HenrikDev para dados da Riot |
| `TELEGRAM_BOT_TOKEN` | Sim | Token do bot Telegram |
| `TELEGRAM_CHAT_ID` | Sim | ID do chat para notificacoes |
| `ADMIN_TELEGRAM_ID` | Sim | Seu user ID para comandos admin |
| `ORACULO_SUPABASE_URL` | Nao | URL do Supabase do Oraculo (para fila de analise) |
| `ORACULO_SUPABASE_SERVICE_KEY` | Nao | Chave do Oraculo (para fila de analise) |
| `PORT` | Nao | Porta do Express (default: 3000) |

### Execucao

```bash
# Bot Telegram + servidor Express
npm start

# Sincronizacao manual de dados
npm run sync

# Frontend (em outro terminal)
cd frontend && npm install && npm run dev

# Testes
npm test
```

---

## Comandos do Bot Telegram (K.A.I.O.)

| Comando | Descricao |
|---|---|
| `/start` | Inicializa interface e menu |
| `/vincular [RiotID#Tag]` | Vincula Telegram ao perfil do jogador |
| `/unidade [ALPHA/OMEGA/WINGMAN]` | Transferencia de squad (valida ranking de sinergia) |
| `/ranking` | Top 10 por pontos de sinergia |
| `/perfil [Nick]` | Perfil completo: sinergia, rank, card |
| `/convocar [Codigo]` | Convoca squad para LFG |
| `/analisar` | Solicita analise profunda ao Oraculo V |
| `/ajuda` | Manual de comandos |

---

## Motor de Sinergia

Pontos calculados por partida baseados no tamanho do squad e resultado:

| Squad | Base | Vitoria |
|---|---|---|
| 2 jogadores | 1 pt | 2 pts |
| 3 jogadores | 2 pts | 4 pts |
| 4+ jogadores | 5 pts | 10 pts |

**DM Score**: Kills + bonus por posicao no ranking (Top 1: +15, Top 2: +10, Top 3: +5).

---

## Integracao com Oraculo V

O Protocolo V despacha briefings de combate para o Oraculo V via REST ou fila compartilhada no Supabase (`match_analysis_queue`).

**Contrato de Briefing:**
```json
{
  "match_id": "UUID",
  "player_id": "Nick#Tag",
  "map_name": "Haven",
  "agent_name": "Viper",
  "kills": 24, "deaths": 12,
  "adr": 165.5, "kast": 82
}
```

Se o Oraculo estiver offline, o briefing e enfileirado para retry automatico. O sistema degrada graciosamente — dados de partida persistem mesmo sem analise.

---

## Estrutura de Diretorios

```
protocolov/
  src/
    telegram-bot.js    # Bot + Express server (entrada principal)
    update-data.js     # Sincronizador de dados (GitHub Actions)
    oraculo.js         # Motor de analise local (standalone)
    db.js              # Cliente Supabase
  services/
    api-client.js      # Smart fetch com rate-limiting e retry
    synergy-engine.js  # Calculo de sinergia e DM score
    oraculo-service.js # REST bridge para o Oraculo V
    player-worker.js   # Processamento individual de jogador
    notifier.js        # Notificacoes Telegram
    match-briefing.js  # Empacotamento de dados de partida
    achievements.js    # Milestones de performance
  frontend/            # React SPA (Vite)
  docs/                # Portal GitHub Pages
  documentation/       # Docs tecnicos (API.md, PROJECT_CONTEXT.md)
  tests/               # Suite Jest
  scripts/             # Utilitarios de manutencao
  .github/workflows/   # GitHub Actions
```

---

## Banco de Dados (Supabase)

Tabelas principais:

| Tabela | Descricao |
|---|---|
| `players` | Identidade, rank, sinergia, Holt-Winters state |
| `operations` | Historico de partidas (mapa, score, resultado) |
| `operation_squads` | Composicao do squad por operacao |
| `match_analysis_queue` | Fila de briefings para o Oraculo V |
| `ai_insights` | Insights do Oraculo (mirror via dual-write) |
| `active_calls` | Convocacoes LFG ativas |

---

## Links

- [Arquitetura Global do Ecossistema](../ARCHITECTURE.md)
- [API e Integracoes](documentation/API.md)
- [Contexto do Projeto](documentation/PROJECT_CONTEXT.md)
- [Guia de Contribuicao](CONTRIBUTING.md)

---

*Protocolo V: Precisao. Sinergia. Vitoria.*
