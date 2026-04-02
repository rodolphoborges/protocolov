# PROJECT_CONTEXT.md // PROTOCOLO V

## 1. Visão Geral e Arquitetura
O **Protocolo V** é uma plataforma de gestão e análise tática para times de Valorant, operando sob uma estética de "Terminal/Cyberpunk" (K.A.I.O. // Oráculo V). O sistema centraliza dados de performance, sinergia de esquadrões e automação de recrutamento.

### Stack Tecnológica
- **Backend**: Node.js (Express) executando scripts de sincronização e o Bot do Telegram.
- **Frontend**: Single Page Application (SPA) desenvolvida em React 19, utilizando Vite 8 e React Router 7.
- **Banco de Dados**: Supabase (PostgreSQL).
- **Arquitetura de Serviços**: O sistema utiliza uma estrutura modular e resiliente:
    - `services/api-client.js`: Abstração de rede, headers e tratamento de rate-limiting (429).
    - `services/synergy-engine.js`: Motor de cálculo de pontos de sinergia e classificação de operações.
    - `services/notifier.js`: Sistema de alertas descentralizado (Telegram/Logs).
    - `services/player-worker.js`: Gerenciador individual de atualização de agentes e metadados.

### Estrutura de Diretórios
- `src/`: Core Engine (`telegram-bot.js`, `update-data.js`, `db.js`).
- `update-data.js`: Wrapper de compatibilidade na raiz que delega para `src/`.
- `frontend/`: Nova interface administrativa e de monitoramento (React 19).
- `docs/`: Portal estático para visualização rápida (GitHub Pages).
- `scripts/`: Utilitários (Maintenance, API Probe, Debug).
- `services/`: Módulos de lógica desacoplada (Engine, Notifier, Workers).
- `tests/`: Suíte de testes automatizados (Jest).
- `documentation/`: Documentação técnica do sistema.
- **Protocolo Fantasma**: Camada de integridade que valida e expurga agentes inexistentes.

## 2. Fluxo de Dados
1.  **Ingestão de Dados**: O arquivo `src/update-data.js` (ou o wrapper na raiz) é executado via GitHub Actions a cada 30 minutos.
    - Ele consome a API da HenrikDev para buscar as últimas partidas dos jogadores cadastrados.
    - Calcula pontos de **Sinergia** e atualiza métricas de ADR/HS no Supabase.
2.  **Análise Profunda (Oráculo V)**: Após a ingestão, o sistema despacha briefings de combate para o Oráculo V via REST.
    - **Requisito**: As variáveis `ORACULO_API_URL` e `ORACULO_API_KEY` devem estar configuradas no ambiente.
    - A chamada é **fire-and-forget** com timeout de 3 segundos — o endpoint `/api/queue` retorna 202 imediatamente e o Oráculo processa em background de forma autônoma.
    - Se o Oráculo estiver offline, o briefing é salvo localmente em `match_analysis_queue` para retry automático (backoff: 5min → 15min → 60min, máx 3 tentativas).
    - Falhas na análise **não afetam** o resultado do sync — o Protocolo V sempre termina com sucesso se os dados de partida foram persistidos.
    - O **Worker do Oráculo** (processo separado) processa a fila e gera relatórios individuais com **Performance Index contextual** (Role-Aware), classificação em **três ranks técnicos** (Alpha/Omega/Depósito de Torreta) e Heurística K.A.I.O.

3.  **Interface de Controle (Telegram)**: O `src/telegram-bot.js` atua como o HUB de comando, permitindo vincular rádios, convocar esquadrões (LFG) e disparar análises manuais.
4.  **Exibição (Frontend)**: A pasta `docs/` contém o site que consome dados do Supabase e do Oráculo.

## 3. Débitos Técnicos e Pontos de Atenção
Baseado no Code Review (Março/2026), foram identificados os seguintes pontos para evolução futura:

> [!WARNING]
> **Segurança (RLS)**: Embora as chaves Service Role tenham sido removidas do código, o sistema ainda depende fortemente de políticas de Row Level Security (RLS) no Supabase para proteger a escrita de dados no frontend. Recomenda-se migrar toda lógica de escrita para Edge Functions.

> [!IMPORTANT]
> **Integridade de Dados (Ghost Protocol)**: O sistema agora valida automaticamente o alistamento via API e remove registros "fakes" (404) durante a sincronização, garantindo que apenas agentes reais ocupem o banco.

> [!TIP]
> **Performance**: A renderização do frontend utiliza cache local (`localStorage`) para ativos pesados como mapas, reduzindo o tempo de carregamento e o consumo de banda.
