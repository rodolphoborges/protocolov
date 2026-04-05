# PROTOCOLO V // K.A.I.O. — COMANDO CENTRAL

[![Atualiza Dados](https://github.com/rodolphoborges/protocolov/actions/workflows/update.yml/badge.svg)](https://github.com/rodolphoborges/protocolov/actions/workflows/update.yml)

> Centro de comando para recrutamento, gestão de esquadrões e ingestão de dados de combate do Valorant.
> Atua como o **Data Owner** do ecossistema, gerindo a identidade dos jogadores e requisitando inteligência artificial ao *Oráculo-V*.

Para compreender os detalhes interligados da infraestrutura global (Filas, Banco de Dados e Motores JS), leia o [Relatório de Arquitetura Global](../ARCHITECTURE.md).

---

## 🚀 Setup & Instalação

### Pré-requisitos
- Node.js v18+
- Docker & Docker Compose (opcional, recomendado para orquestração local)
- Conta no [Supabase](https://supabase.com/)
- API Key da [HenrikDev](https://henrikdev.xyz/dashboard)
- Token de Bot Telegram via [@BotFather](https://t.me/BotFather)

### Instalação (Standalone)

```bash
git clone https://github.com/rodolphoborges/protocolov.git
cd protocolov
npm install
cp .env.example .env
```

### Orquestração via Docker (Recomendado)
A melhor forma de subir o Protocolo-V em conjunto com o motor Oráculo-V é usando o **Docker Compose** na raiz do repositório parente:

```bash
cd .. # Direciona para a raiz de PROJETOS-V
docker-compose up --build
```
*(O ecossistema irá gerir as portas 3000 e 3001 e simular uma rede bridge local)*

---

## 🔑 Variáveis de Ambiente

> **SEGURANÇA**: O arquivo `.env` contém credenciais sensíveis (chaves Supabase, Token Telegram). Nunca integre (`commit`) este ficheiro. Use `.env.example` como gabarito.

| Variável | Obrigatoriedade | Descrição |
|---|---|---|
| `SUPABASE_URL` | Obrigatório | URL do projeto Supabase |
| `SUPABASE_SERVICE_KEY` | Obrigatório | Chave Service Role |
| `HENRIK_API_KEY` | Obrigatório | Chave HenrikDev para resgate de dados da Riot |
| `TELEGRAM_BOT_TOKEN` | Obrigatório | Token do bot Telegram |
| `TELEGRAM_CHAT_ID` | Opcional | ID do chat para notificações de grupo |
| `ADMIN_TELEGRAM_ID` | Obrigatório | Seu user ID para comandos de admin |
| `ORACULO_API_URL` | Opcional | Endpoint alvo do Oráculo V para enviar *briefings* de análise. |
| `ORACULO_API_KEY` | Opcional | Chave para autorizar envio dos briefings no Oráculo-V. |
| `ADMIN_API_KEY` | Opcional | Chave partilhada requerida pelo Webhook (`/api/insights/callback`) para garantir segurança de chegada de dados do Oráculo. |

---

## 💻 Execução Manual e Scripts (Standalone)

Caso não esteja utilizando Docker/Compose:

```bash
# Sobe a Express API (Webhook) e inicializa interação do Telegram (Polling Ativo)
npm start

# Força o varrimento no HenrikDev agora (via Cron job/GitHub Actions originalmente)
npm run sync

# O Frontend funciona à parte num repositório focado de React DOM (se compilável no Node module)
cd frontend && npm install && npm run dev

# Roda os Jest Test Hooks
npm test
```

---

## 🤖 Comandos K.A.I.O. (Telegram Bot)

| Comando | Descrição |
|---|---|
| `/start` | Inicializa interface e menu |
| `/vincular [RiotID#Tag]` | Associa Conta do Telegram ao perfil do jogador in-game |
| `/unidade [ALPHA/OMEGA/WINGMAN]` | Transferência de squad local. |
| `/ranking` | Devolve o Top 10 por pontos de sinergia de Base |
| `/perfil [Nick]` | Exibe resumo: sinergia, rank, e badge |
| `/convocar [Código]` | Convoca o atual squad para LFG (Looking for Group) |
| `/analisar` | Solicita à força uma análise de Oráculo V (Queueing manual) |
| `/ajuda` | Manual de botões interativos |

---

## 🧩 Integração com Oráculo-V via Webhooks

O Oráculo processará assincronamente os *briefings* e submeterá os resultados finais para o Protocolo-V no formato:
`POST /api/insights/callback`

O Protocolo-V verifica a validade da token de autorização, persiste a informação nos sumários do jogador, e finaliza interações com o Chat do Telegram se solicitado. Resiliência por princípio.

---
*Protocolo V: Precisão. Sinergia. Vitória.*
