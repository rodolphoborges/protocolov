# 🧠 Contexto do Projeto: Protocolo V

O **Protocolo V** é uma plataforma integrada de inteligência tática, recrutamento e análise de performance voltada para o ecossistema competitivo de Valorant. O sistema automatiza a coleta de dados, organiza esquadrões e fornece insights profundos sobre o desempenho dos agentes através de uma interface unificada.

## 🏗️ Arquitetura do Sistema

O projeto utiliza uma arquitetura baseada em micro-scripts e serviços integrados:

1.  **Backend (Node.js):**
    - **Núcleo de Sincronização (`update-data.js`):** Responsável por orquestrar a coleta de dados via HenrikDev API e manter o banco de dados Supabase atualizado.
    - **K.A.I.O. (Telegram Bot):** Interface de comando e controle para os usuários, gerenciando vínculos de contas, convocações (LFG) e consultas de perfil.
    - **Oráculo V (`oraculo.js`):** Motor de análise profunda que processa IDs de partidas para extrair métricas avançadas (ADR, K/D, First Bloods) e gerar relatórios automatizados.

2.  **Frontend (Web):**
    - Interface estática construída com **Vanilla JS**, HTML5 e CSS3, servindo como terminal de visualização para os rankings, dossiês de agentes e análises de missões.

3.  **Banco de Dados (Supabase):**
    - PostgreSQL para persistência de dados de jogadores, histórico de operações, esquadrões e fila de análise do Oráculo.

4.  **Automação (GitHub Actions):**
    - Pipelines de CI/CD que executam a sincronização de dados a cada 30 minutos e garantem a integridade do código via testes automatizados.

## 🔄 Fluxo de Dados

O ciclo de vida da informação no Protocolo V segue o seguinte fluxo:

1.  **Extração:** O script `update-data.js` consulta os endpoints da Riot Games (via API HenrikDev) para buscar novas partidas competitivas e de treino (DM).
2.  **Processamento:** Os dados brutos são filtrados e transformados em métricas de Sinergia e Performance.
3.  **Persistência:** Informações normalizadas são enviadas para as tabelas `players`, `operations` e `match_analysis_queue` no Supabase.
4.  **Interação:** Através do bot do Telegram, usuários solicitam análises específicas que são enfileiradas e processadas pelo componente Oráculo V.
5.  **Exibição:** O frontend consome os dados do Supabase em tempo real para renderizar os dashboards no site.

## 🤖 Ecossistema de Autometização

### GitHub Actions
- **Atualização Contínua:** Mantém a "saúde" dos dados sem intervenção humana.
- **Testes E2E:** Garante que mudanças no código não quebrem a lógica de cálculo de rank ou sinergia.

### Bot do Telegram (K.A.I.O.)
Atua como o "Rádio" do protocolo, permitindo que os agentes:
- Vinculem suas identidades Riot.
- Chamem reforços orbitais (LFG) para fechar esquadrões.
- Recebam alertas de "Lobo Solitário" quando estão operando fora de um esquadrão registrado.
