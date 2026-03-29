# PROTOCOLO V // Oráculo Analytics

[![Atualiza Dados](https://github.com/rodolphoborges/protocolov/actions/workflows/update.yml/badge.svg)](https://github.com/rodolphoborges/protocolov/actions/workflows/update.yml)

Plataforma avançada de recrutamento, análise de performance e gestão de esquadrões de elite para Valorant. O Protocolo V atua como a interface de comando central (K.A.I.O.) para otimizar a sinergia e os resultados táticos do time.

## 🏢 Governança de Dados (Data Owner)

O Protocolo-V é a autoridade máxima e única fonte da verdade para o ecossistema. Suas responsabilidades incluem:

- **Identidade de Agente**: Gestão de Riot IDs, Tags e metadados de perfil dos jogadores.
- **Operações de Esquadrão**: Orquestração das squads (Alpha, Omega, Depósito de Torreta) e alocação de missões.
- **Integridade Referencial**: Geração mandatória de `match_id` no formato **UUID**. Esta é a regra de ouro para a sincronização com serviços externos.

## 🚀 Stack & Resiliência
- **Framework**: Antigravity (Arquitetura Ágil & Resiliente)
- **Engine**: [Node.js](https://nodejs.org/) v18+
- **Database**: [Supabase](https://supabase.com/) (PostgreSQL)
- **API**: HenrikDev Valorant API

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
- `ORACULO_SUPABASE_URL` / `ORACULO_SUPABASE_SERVICE_KEY` (Opcional, para fila do Oráculo)


### 3. Execução
```bash
# Instalar dependências
npm install

# Iniciar o Bot do Telegram e Servidor
npm start

# Rodar sincronizador de dados manualmente (via wrapper ou npm)
node update-data.js
# ou
npm run sync

```

## 🔄 Ciclo de Vida da Missão
O projeto utiliza **GitHub Actions** e o motor **Antigravity** para garantir a continuidade operacional:
- **Update Workflow (`update.yml`)**: Sincronização de partidas a cada 30 minutos.
- **Despacho de Briefing**: Ao detectar uma nova partida, o Protocolo-V gera o `match_id` (UUID) e despacha o briefing JSON para o Oráculo-V.
- **Ingestão de Insights**: O sistema monitora o callback do Oráculo para atualizar o dashboard tático.

## 📖 Documentação de Arquitetura
Para detalhes técnicos sobre o ecossistema distribuído, consulte o [Arquivo de Arquitetura Principal](../ARCHITECTURE.md).

- [Guia de API e Integrações](documentation/API.md)
- [Contribuindo com o Projeto](CONTRIBUTING.md)

---
*Protocolo V: Precisão. Sinergia. Vitória.*
