# 📡 Especificação de API e Comandos

Este documento detalha as integrações externas e a interface de comandos do bot do Telegram do Protocolo V.

## 🌐 Integrações de API Externas

O projeto consome a **HenrikDev API** para acessar dados oficiais de Valorant.

### Endpoints Principais

| Recurso | Método | Endpoint | Versão | Descrição |
| :--- | :--- | :--- | :--- | :--- |
| **Histórico** | GET | `/valorant/v3/matches/{region}/{name}/{tag}` | V3 | Retorna as últimas 20 partidas do agente. |
| **MMR** | GET | `/valorant/v2/mmr/{region}/{name}/{tag}` | V2 | Fallback para extração de Rank/Elo atualizado. |
| **Partida Full** | GET | `/valorant/v4/match/{region}/{matchId}` | V4 | Dados granulares para o motor Oráculo V. |
| **Status** | GET | `/valorant/v1/status/{region}` | V1 | Monitoramento de saúde dos servidores da Riot. |

### Estrutura de Autenticação
As requisições devem incluir o header de autorização:
```js
headers: { 'Authorization': 'SUA_HENRIK_API_KEY' }
```

## 🤖 Comandos do Telegram (K.A.I.O.)

Interface principal de interação dos agentes com o protocolo.

### Comandos Públicos

- `/start`: Inicializa a interface e exibe o painel de boas-vindas.
- `/vincular [Nick#Tag]`: Conecta o ID do Telegram ao Riot ID (essencial para tracking).
- `/perfil [Nick]`: Exibe o dossiê completo do agente (Rank, Sinergia, Performance Index).
- `/analisar [MatchUUID]`: Envia uma partida para processamento profundo no Oráculo V.
- `/convocar [Código]`: Cria um sinalizador de LFG no Telegram e no site para atrair reforços.
- `/unidade`: Abre o menu de transferência entre esquadrões (Alpha, Omega, Wingman).
- `/ranking`: Exibe o Top 10 de agentes por Sinergia.
- `/site`: Link direto para o terminal web.
- `/ajuda`: Manual de operações táticas.

### Comandos Administrativos (Restritos)

- `/radar`: Diagnóstico de latência e conexão com a API oficial.
- `/alerta_vermelho [Mensagem]`: Transmissão global de rádio para todos os agentes vinculados.
- `/reciclar [MatchUUID]`: Reinicia o status de uma análise específica na fila do Oráculo.
- `/reciclar_tudo`: Reinicia todas as análises completas ou falhas para reprocessamento global.
- `/expurgar [Nick#Tag]`: Remove permanentemente um registro da base de dados.
- `/meu_id`: Exibe metadados de rádio para fins de depuração.

## 📊 Estrutura de Dados Oráculo V

O processamento de análises (`oraculo.js`) gera um objeto de metadados com a seguinte estrutura sugerida:

```json
{
  "performance_index": 85,
  "adr": 165.4,
  "kd": 1.25,
  "first_kills": 4,
  "first_deaths": 2,
  "clutches": {
    "1v1": 2,
    "1v2": 1
  },
  "badges": ["Abriu o Round", "Clutcher"]
}
```
