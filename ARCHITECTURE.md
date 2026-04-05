# Arquitetura Global: Ecossistema Protocolo-V & Oráculo-V

**Data de Atualização:** 05/04/2026
**Status:** Produção — Desacoplado & Escalável

Este documento descreve a arquitetura geral do ecossistema e como os seus dois principais microsserviços interagem de forma soberana e resiliente.

---

## 1. Visão Geral dos Domínios

O ecossistema adota uma arquitetura orientada a serviços (SOA), dividindo responsabilidades claras entre dois sistemas principais:

### 1.1 Protocolo-V (Data Owner)
Responsável por gerir a "verdade" dos utilizadores e das operações de combate.
- **Identidade e Guilda**: Gere Riot IDs, vínculos com o Telegram, unidades táticas (ALPHA, OMEGA, WINGMAN) e rankings de sinergia.
- **Ingestão**: Varre ativamente satélites da Riot Games (via HenrikDev API) para encontrar novas operações competitivas.
- **Contrato de Decisão**: Avalia quando é necessário invocar os serviços de IA e empacota a operação num *Briefing Tático* padronizado.

### 1.2 Oráculo-V (Service Provider)
Responsável pela força computacional bruta e geração de *insights* baseados em dados de combate.
- **Motor Matemático (JS Nativo)**: Computa estatísticas de *Performance Index* e projeções *Holt-Winters Double Exponential Smoothing*. Escrito exclusivamente em JavaScript (Node.js) para máxima performance, abandonando o antigo *overhead* de instâncias Python.
- **Processamento Assíncrono**: Gere a sua própria fila e ciclo de vida de *jobs* (retry strategies, backoff exponencial).
- **Motor LLM Tríplice**: Utiliza um padrão *fallback* resiliente para processamento de NLP (Ollama Local -> Groq -> OpenRouter) para criar análises sintéticas sem alucinações.

---

## 2. Padrões de Comunicação e Resiliência

Foi erradicado o padrão *Dual-Write* (acesso partilhado direto a bases de dados por diferentes domínios), que criava um acoplamento perigoso. O ecossistema segue agora os seguintes princípios:

### 2.1 Soberania de Dados e Webhooks (Webhook Callbacks)
Os serviços interagem **apenas mediante REST APIs**.

1. O **Protocolo-V** deteta uma nova operação competitiva e evoca um `POST /api/queue` para o **Oráculo-V**. Este pedido falha rapidamente se offline (fire-and-forget com timeout de 3s). Em caso de indisponibilidade, o job é acumulado no próprio banco do Protocolo-V para tentativa futura. Se o Oráculo aceita o pedido, devolve instantaneamente um HTTP HTTP 202 (Accepted).
2. O **Oráculo-V** toma a posse do trabalho e enfileira no seu próprio BD isolado (`match_analysis_queue`).
3. Quando a análise LLM é concluída, o *worker* nativo do **Oráculo-V** efetua um callback HTTPS (Webhook) para o **Protocolo-V** no endpoint autorizado: `POST /api/insights/callback`, apresentando uma `ADMIN_API_KEY`.
4. O **Protocolo-V** assinala a análise, notifica o user via Telegram e guarda no seu próprio historial estático.

### 2.2 Orquestração Unificada (Docker)
Todo o ecossistema é suportado por contentores. Apenas com o correr do `docker-compose up` no root-level, o ambiente local espelha a rede de produção:
- Cada serviço expõe uma porta (`3000` para Protocolo-V, `3001` para Oráculo-V).
- Variáveis de ambiente como o `PROTOCOL_API_URL` já estão cabeadas para a DNS interna do dock (`http://protocolov:3000`).

---

## 3. Checklist de Marco Zero Arquitetural

As dívidas técnicas passadas foram estritamente solvidas.

- [x] **Desacoplar Bancos de Dados**: Eliminação da `PROTOCOL_SUPABASE_KEY` do ambiente Oráculo; Migração pra contratos REST *Callback-based*.
- [x] **Migração do Motor Matemático**: A conversão de `analyze_valorant.py` puro para `analyze_valorant.js` suprimiu o estrangulamento da *V8 Engine Spawns*, unificando a *codebase* no ambiente nativo do *Node.js Worker*.
- [x] **Dockerização Central**: Adição do `docker-compose.yml` e scripts agrupados do `concurrently` (via `package.json` base).
- [x] **Normalização Documental**: *READMEs* focados apenas em *setup* e esta Arquitetura como a base teórica de verdade mútua.

---
*Protocolo-V / Arquitetura Distribuída / Documentação Mantida por Agente Antigravity*
