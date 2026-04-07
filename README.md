# PROTOCOLO V // K.A.I.O. — COMANDO CENTRAL

[![Atualiza Dados](https://github.com/rodolphoborges/protocolov/actions/workflows/update.yml/badge.svg)](https://github.com/rodolphoborges/protocolov/actions/workflows/update.yml)

> Centro de comando para recrutamento, gestao de esquadroes e ingestao de dados de combate do Valorant.
> Atua como o **Data Owner** do ecossistema, gerindo a identidade dos jogadores e requisitando inteligencia artificial ao *Oraculo-V*.

Para compreender os detalhes da infraestrutura global (Filas, Banco de Dados e Motores JS), leia o [Relatorio de Arquitetura Global](./ARCHITECTURE.md).

---

## Stack Tecnologica

| Camada | Tecnologia |
|---|---|
| Backend | Node.js (Express) |
| Bot | Telegram Bot API (`node-telegram-bot-api`) |
| Database | Supabase (banco proprio + acesso ao Oraculo para consultas) |
| HTTP Client | Axios |
| API de Dados | HenrikDev API (v1, v3, v4) |
| Frontend | React 19 + Vite 8 (em desenvolvimento) |
| Testes | Jest |

---

## Setup & Instalacao

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

---

## Variaveis de Ambiente

> **SEGURANCA**: O arquivo `.env` contem credenciais sensiveis. Nunca integre (`commit`) este ficheiro. Use `.env.example` como gabarito.

| Variavel | Obrigatoriedade | Descricao |
|---|---|---|
| `SUPABASE_URL` | Obrigatorio | URL do projeto Supabase |
| `SUPABASE_SERVICE_KEY` | Obrigatorio | Chave Service Role |
| `HENRIK_API_KEY` | Obrigatorio | Chave HenrikDev para resgate de dados da Riot |
| `TELEGRAM_BOT_TOKEN` | Obrigatorio | Token do bot Telegram |
| `ADMIN_TELEGRAM_ID` | Obrigatorio | Seu user ID para comandos admin |
| `TELEGRAM_CHAT_ID` | Opcional | ID do chat para notificacoes de grupo |
| `ORACULO_API_URL` | Opcional | Endpoint do Oraculo V (padrao: `http://localhost:3001`) |
| `ORACULO_API_KEY` | Opcional | Chave para autorizar envio de briefings |
| `ADMIN_API_KEY` | Opcional | Chave do Webhook (`/api/insights/callback`) |
| `ORACULO_SUPABASE_URL` | Opcional | URL do banco do Oraculo (para consultas diretas de fila) |
| `ORACULO_SUPABASE_SERVICE_KEY` | Opcional | Chave do banco do Oraculo |
| `WEBHOOK_URL` | Opcional | URL publica para modo Webhook do Telegram (se ausente, usa Polling) |
| `PORT` | Opcional | Porta do servidor Express (padrao: 3000) |

---

## Execucao

```bash
# Sobe a Express API + Bot Telegram (Polling ou Webhook conforme WEBHOOK_URL)
npm start

# Forca varrimento de dados no HenrikDev (via Cron/GitHub Actions)
npm run sync

# Testes
npm test
```

### Frontend (em desenvolvimento)
```bash
cd frontend && npm install && npm run dev
```

> **Nota**: O frontend React esta em fase inicial (scaffold Vite). O dashboard funcional ainda nao foi implementado.

---

## Comandos K.A.I.O. (Telegram Bot)

### Comandos Publicos

| Comando | Descricao |
|---|---|
| `/start` | Inicializa interface e menu |
| `/vincular [RiotID#Tag]` | Associa conta Telegram ao perfil in-game |
| `/unidade [ALPHA/OMEGA/WINGMAN]` | Transferencia de squad |
| `/ranking` | Top 10 por pontos de sinergia |
| `/perfil [Nick]` | Resumo: sinergia, rank e badge |
| `/analisar [matchId]` | Solicita analise ao Oraculo-V |
| `/convocar [Codigo]` | Convoca squad para LFG (Looking for Group) |
| `/papo [mensagem]` | Chat com K.A.I.O. via LLM (Oraculo-V) |
| `/como_funciona` | Explicacao do sistema |
| `/ajuda` | Menu de ajuda |
| `/site` | Link do site do projeto |
| `/meu_id` | Mostra seu Telegram ID e config do admin |

### Comandos Admin (apenas `ADMIN_TELEGRAM_ID`)

| Comando | Descricao |
|---|---|
| `/radar` | Executa varrimento manual de operacoes |
| `/reciclar [Nick#Tag]` | Remove jogador especifico |
| `/reciclar_tudo` | Remove todos os jogadores inativos |
| `/expurgar [Nick#Tag]` | Purga completa de um jogador |
| `/alerta_vermelho [mensagem]` | Broadcast de alerta para todos |

### Interacoes via Callback Buttons

O bot tambem responde a botoes inline para:
- **LFG**: Ingressar em convocacoes (`lfg_join_*`)
- **Unidades**: Confirmar transferencia de squad (`uni_*`)
- **Convocacao**: Aceitar/recusar convocacao de squad (`cvc_*`)

---

## Endpoints Express

O servidor Express esta embutido no `src/telegram-bot.js`:

| Metodo | Rota | Descricao |
|---|---|---|
| `GET` | `/` | Health check (HTML) |
| `GET` | `/vanguard-health` | Health check (JSON) |
| `POST` | `/bot{token}` | Webhook do Telegram (se `WEBHOOK_URL` configurado) |
| `POST` | `/api/insights/callback` | Recebe resultados do Oraculo-V (auth via `x-api-key`) |

---

## Integracao com Oraculo-V

### Envio de Briefings
O Protocolo-V envia briefings para `POST {ORACULO_API_URL}/api/queue` via `services/oraculo-service.js`.

### Recebimento de Resultados
O Oraculo-V envia resultados de volta via `POST /api/insights/callback`. O Protocolo-V verifica a `x-api-key`, persiste a informacao e notifica o usuario via Telegram.

### Consultas Diretas (Opcional)
Se `ORACULO_SUPABASE_URL` estiver configurado, o Protocolo-V tambem consulta diretamente a fila do Oraculo (`match_analysis_queue`) para mostrar status de jobs em andamento.

> **Nota arquitetural**: Apesar do objetivo de comunicacao exclusiva via REST, o codigo atual mantem acesso direto ao banco do Oraculo para algumas consultas. Veja [ARCHITECTURE.md](./ARCHITECTURE.md) para detalhes.

---

## API HenrikDev

O projeto utiliza multiplas versoes da API HenrikDev simultaneamente:

| Versao | Uso | Arquivo |
|---|---|---|
| V1 | Verificacao de conta (vincular) | `telegram-bot.js` |
| V3 | Busca de partidas por jogador | `update-data.js` |
| V4 | Dados detalhados de partida por match ID | `oraculo.js` |

---

## Configuracao de Rate Limiting

O arquivo `settings.json` controla parametros de API e banco:

```json
{
  "api": {
    "base_delay_ms": 15000,
    "max_delay_ms": 30000,
    "timeout_ms": 20000,
    "batch_size": 1,
    "jitter_max_ms": 4000
  },
  "database": {
    "days_inactive_purge": 7,
    "max_operations_history": 500
  }
}
```

---
*Protocolo V: Precisao. Sinergia. Vitoria.*
