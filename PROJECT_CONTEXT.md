# PROJECT_CONTEXT.md // PROTOCOLO V

## 1. Visão Geral e Arquitetura
O **Protocolo V** é uma plataforma de gestão e análise tática para times de Valorant, operando sob uma estética de "Terminal/Cyberpunk" (K.A.I.O. // Oráculo V). O sistema centraliza dados de performance, sinergia de esquadrões e automação de recrutamento.

### Stack Tecnológica
- **Backend**: Node.js (Express) executando scripts de sincronização e o Bot do Telegram.
- **Frontend**: Single Page Application (SPA) em HTML5/Vanilla JS e CSS3 customizado.
- **Banco de Dados**: Supabase (PostgreSQL + Realtime + Auth).
- **Infraestrutura**: GitHub Actions para CI/CD e workflows de atualização periódica.
- **Integração**: HenrikDev API (v3/v4) para extração de dados brutos da Riot Games.

### Estrutura de Diretórios
- `/`: Scripts principais do backend (`telegram-bot.js`, `update-data.js`, `oraculo.js`).
- `/lib` ou `/utils` (em transição): Contém `db.js` para conexões centralizadas.
- `/tests`: Suíte de testes unitários e de integração (Jest).
- `index.html`, `analise.html`, `briefing.html`: Pontos de entrada do frontend.

## 2. Fluxo de Dados
1.  **Ingestão de Dados**: O arquivo `update-data.js` é executado via GitHub Actions a cada 30 minutos.
    - Ele consome a API da HenrikDev para buscar as últimas partidas dos jogadores cadastrados.
    - Calcula pontos de **Sinergia** e atualiza métricas de ADR/HS no Supabase.
2.  **Análise Profunda (Oráculo)**: Através do `oraculo.js`, o sistema processa rounds específicos das partidas para gerar badges táticas e conselhos via Heurística K.A.I.O.
3.  **Interface de Controle (Telegram)**: O `telegram-bot.js` permite que administradores convoquem jogadores, monitorem o radar em tempo real e consultem perfis diretamente.
4.  **Exibição (Frontend)**: O site consome dados do Supabase via chaves públicas (Anon) e renderiza dinamicamente os esquadrões (ALPHA/OMEGA).

## 3. Débitos Técnicos e Pontos de Atenção
Baseado no Code Review (Março/2026), foram identificados os seguintes pontos para evolução futura:

> [!WARNING]
> **Segurança (RLS)**: Embora as chaves Service Role tenham sido removidas do código, o sistema ainda depende fortemente de políticas de Row Level Security (RLS) no Supabase para proteger a escrita de dados no frontend. Recomenda-se migrar toda lógica de escrita para Edge Functions.

> [!IMPORTANT]
> **Acoplamento**: O `update-data.js` ainda é um script monolítico. Long-term, deve ser quebrado em micro-workers ou jobs de fila menores para maior resiliência a falhas de rede.

> [!TIP]
> **Performance**: A renderização do frontend via `innerHTML` em grandes volumes de dados pode ser otimizada para virtualização ou o uso de um framework reativo (ex: Vue/React) caso o volume de operações cresça exponencialmente.
