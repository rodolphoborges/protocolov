# Arquitetura Global: Ecossistema Protocolo-V & Oraculo-V

**Data de Atualizacao:** 07/04/2026
**Status:** Producao — Parcialmente Desacoplado

Este documento descreve a arquitetura geral do ecossistema e como os dois principais microsservicos interagem.

---

## 1. Visao Geral dos Dominios

O ecossistema adota uma arquitetura orientada a servicos (SOA), dividindo responsabilidades entre dois sistemas:

### 1.1 Protocolo-V (Data Owner)
Responsavel por gerir a "verdade" dos utilizadores e das operacoes de combate.
- **Identidade e Guilda**: Gere Riot IDs, vinculos com o Telegram, unidades taticas (ALPHA, OMEGA, WINGMAN) e rankings de sinergia.
- **Ingestao**: Varre ativamente a Riot Games (via HenrikDev API v1/v3/v4) para encontrar novas operacoes competitivas.
- **Contrato de Decisao**: Avalia quando e necessario invocar os servicos de IA e empacota a operacao num Briefing Tatico padronizado.
- **Bot Telegram**: Interface primaria de interacao com os usuarios (comandos, callbacks, notificacoes).
- **Express Server**: Embutido no `telegram-bot.js`, expoe endpoints REST para health checks e recebimento de callbacks do Oraculo.

### 1.2 Oraculo-V (Service Provider)
Responsavel pela forca computacional bruta e geracao de insights baseados em dados de combate.
- **Motor Matematico (JS Nativo)**: Computa Performance Index e projecoes Holt-Winters. Escrito exclusivamente em JavaScript (Node.js), abandonando o antigo motor Python.
- **Tribunal Engine**: Motor LLM adversarial com 3 personas (Aliado, Rival, Mentor K.A.I.O.) para coaching tatico.
- **Processamento Assincrono**: Gere a sua propria fila e ciclo de vida de jobs.
- **Cadeia de Fallback LLM**: Groq -> OpenRouter -> Ollama local.

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

Este e um vestigio da arquitetura Dual-Database anterior que ainda nao foi totalmente removido. O caminho ideal seria migrar estas consultas para chamadas REST ao endpoint `/api/status` do Oraculo.

### 2.3 Fallback de Persistencia (Oraculo -> Protocolo)

Se o webhook callback falhar, o Oraculo-V tenta persistir diretamente no banco do Protocolo-V (via `PROTOCOL_SUPABASE_URL`). Isso e um mecanismo de emergencia, nao o fluxo principal.

---

## 3. Orquestracao

### Docker Compose (Raiz do Workspace)

O arquivo `docker-compose.yml` existe na raiz do workspace (`PROJETOS-V/`) e configura:
- **protocolov**: Porta 3000, depende do oraculov
- **oraculov**: Porta 3001, volume persistente para analises

```bash
cd PROJETOS-V
docker-compose up --build
```

> **Nota**: O Docker Compose esta na raiz do workspace, NAO dentro do diretorio `protocolov`. Cada projeto individual nao possui seu proprio `docker-compose.yml` nem `Dockerfile` — estes precisam ser criados para que a orquestracao funcione.

### Concurrently (Desenvolvimento Local)

O `package.json` raiz do workspace oferece scripts para desenvolvimento sem Docker:

```bash
# Instalar dependencias de ambos os projetos
npm run install:all

# Rodar ambos em paralelo
npm run dev
```

---

## 4. Checklist de Marco Arquitetural

- [x] **Migracao do Motor Python -> JS**: `analyze_valorant.py` substituido por `lib/analyze_valorant.js`
- [x] **Tribunal Engine**: Motor LLM adversarial com 3 personas implementado
- [x] **Webhook Callback**: Oraculo envia resultados via REST para Protocolo
- [ ] **Desacoplamento Total de BD**: Protocolo-V ainda acessa banco do Oraculo diretamente (migrar para REST)
- [ ] **Dockerfiles**: Criar Dockerfile individual para cada projeto
- [ ] **Frontend Dashboard**: React app ainda e scaffold — implementar pages e componentes
- [ ] **Endpoints Admin (Oraculo)**: Frontend admin existe mas backend nao tem os endpoints

---

## 5. Tabelas de Banco de Dados

### Protocolo-V (Supabase)
| Tabela | Descricao |
|---|---|
| `players` | Perfis de jogadores (riot_id, telegram_id, unit, synergy, holt state) |
| `operations` | Historico de partidas competitivas |
| `operation_squads` | Membros de squads por operacao |
| `ai_insights` | Cache local de insights recebidos do Oraculo |

### Oraculo-V (Supabase)
| Tabela | Descricao |
|---|---|
| `match_analysis_queue` | Fila de jobs (pending/processing/failed) |
| `match_stats` | Stats persistidos de cada analise |
| `ai_insights` | Insights gerados pelo Tribunal Engine |

---
*Protocolo-V / Arquitetura Distribuida / Atualizado em 07/04/2026*
