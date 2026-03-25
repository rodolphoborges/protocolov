# PROJECT_CONTEXT.md // PROTOCOLO V

## 1. Visão Geral e Arquitetura
O **Protocolo V** é uma plataforma de gestão e análise tática para times de Valorant, operando sob uma estética de "Terminal/Cyberpunk" (K.A.I.O. // Oráculo V). O sistema centraliza dados de performance, sinergia de esquadrões e automação de recrutamento.

### Stack Tecnológica
- **Backend**: Node.js (Express) executando scripts de sincronização e o Bot do Telegram.
- **Frontend**: SPA em HTML5/Vanilla JS e CSS3 customizado.
- **Banco de Dados**: Supabase (PostgreSQL).
- **Arquitetura de Serviços**: O sistema utiliza uma estrutura modular e resiliente:
    - `services/api-client.js`: Abstração de rede, headers e tratamento de rate-limiting (429).
    - `services/synergy-engine.js`: Motor de cálculo de pontos de sinergia e classificação de operações.
    - `services/notifier.js`: Sistema de alertas descentralizado (Telegram/Logs).
    - `services/player-worker.js`: Gerenciador individual de atualização de agentes e metadados.

### Estrutura de Diretórios
- `/`: Scripts coordenadores (`telegram-bot.js`, `update-data.js`).
- `/services`: Módulos de lógica desacoplada (Engine, Notifier, Workers).
- `/tests`: Suíte de testes automatizados (Jest).
- `db.js`: Centralizador de conexão Supabase com tratamento de segurança.
- **Protocolo Fantasma**: Camada de integridade que valida e expurga agentes inexistentes.

## 2. Fluxo de Dados
1.  **Ingestão de Dados**: O arquivo `update-data.js` é executado via GitHub Actions a cada 30 minutos.
    - Ele consome a API da HenrikDev para buscar as últimas partidas dos jogadores cadastrados.
    - Calcula pontos de **Sinergia** e atualiza métricas de ADR/HS no Supabase.
2.  **Análise Profunda (Oráculo V)**: Após a ingestão, o sistema enfileira automaticamente uma ordem `AUTO` na `match_analysis_queue`.
    - O **Worker do Oráculo** (integrado ao bot) processa essa ordem, varre a partida via API V4 para identificar todos os membros do Protocolo V presentes e gera relatórios individuais com Badges Táticas e Heurística K.A.I.O.
3.  **Interface de Controle (Telegram)**: O `telegram-bot.js` atua como o HUB de comando, permitindo vincular rádios, convocar esquadrões (LFG) e disparar análises manuais.
4.  **Exibição (Frontend)**: O site consome dados do Supabase e do Oráculo para renderizar o dashboard de operações e os relatórios de performance detalhados.

## 3. Débitos Técnicos e Pontos de Atenção
Baseado no Code Review (Março/2026), foram identificados os seguintes pontos para evolução futura:

> [!WARNING]
> **Segurança (RLS)**: Embora as chaves Service Role tenham sido removidas do código, o sistema ainda depende fortemente de políticas de Row Level Security (RLS) no Supabase para proteger a escrita de dados no frontend. Recomenda-se migrar toda lógica de escrita para Edge Functions.

> [!IMPORTANT]
> **Integridade de Dados (Ghost Protocol)**: O sistema agora valida automaticamente o alistamento via API e remove registros "fakes" (404) durante a sincronização, garantindo que apenas agentes reais ocupem o banco.

> [!TIP]
> **Performance**: A renderização do frontend utiliza cache local (`localStorage`) para ativos pesados como mapas, reduzindo o tempo de carregamento e o consumo de banda.
