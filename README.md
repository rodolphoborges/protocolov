# PROTOCOLO V // Oráculo Analytics

[![Atualiza Dados](https://github.com/rodolphoborges/protocolov/actions/workflows/update.yml/badge.svg)](https://github.com/rodolphoborges/protocolov/actions/workflows/update.yml)

Plataforma avançada de recrutamento, análise de performance e gestão de esquadrões de elite para Valorant. O Protocolo V atua como a interface de comando central (K.A.I.O.) para otimizar a sinergia e os resultados táticos do time.

## 🚀 Tecnologias
- **Engine**: [Node.js](https://nodejs.org/) v18+
- **Database**: [Supabase](https://supabase.com/) (PostgreSQL)
- **Frontend**: HTML5, CSS3/Vanilla (Cyberpunk Aesthetic)
- **API**: HenrikDev Valorant API
- **Bot**: Telegram Bot API

## ⚙️ Instalação e Execução

### 1. Pré-requisitos
- Node.js instalado.
- Conta no Supabase.
- API Key da [HenrikDev](https://henrikdev.xyz/dashboard).

### 2. Configuração do Ambiente
Clone o projeto e crie o arquivo `.env` baseado no `.env.example`:
```bash
cp .env.example .env
```
Preencha as variáveis mandatórias:
- `SUPABASE_URL` / `SUPABASE_SERVICE_KEY`
- `HENRIK_API_KEY`
- `TELEGRAM_BOT_TOKEN`

### 3. Execução
```bash
# Instalar dependências
npm install

# Iniciar o Bot do Telegram e Servidor
npm start

# Rodar sincronizador de dados manualmente
npm run sync
```

## 🔄 CI/CD e Automação
O projeto utiliza **GitHub Actions** para garantir a continuidade operacional:
- **Update Workflow (`update.yml`)**: Executa a cada 30 minutos para sincronizar partidas, atualizar a Sinergia do time e disparar o **AUTO-SCAN do Oráculo V** para análise tática imediata. Utiliza cache de `node_modules` e `npm ci` para performance.
- **Testes Automáticos**: Validação de lógica de sinergia e handlers do bot via Jest antes de cada merge.

## 📖 Documentação Adicional
- [Arquitetura e Contexto](docs/PROJECT_CONTEXT.md)
- [Guia de API e Integrações](docs/API.md)
- [Contribuindo com o Projeto](CONTRIBUTING.md)

---
*Protocolo V: Precisão. Sinergia. Vitória.*
