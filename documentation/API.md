# API.md // PROTOCOLO V

## 1. Integrações Externas

### HenrikDev API (V4)
O projeto utiliza a API da HenrikDev como fonte primária de dados do Valorant.
- **Endpoint Base**: `https://api.henrikdev.xyz/valorant/v4/`
- **Script de Validação**: `scripts/api/probe_api_v4.js`
    - Uso: `node scripts/api/probe_api_v4.js [type] [matchId]`
    - Tipos suportados: `metadata`, `damage`, `stats`, `round`, `player`.

### Telegram Bot API
- **Dependência**: `node-telegram-bot-api`
- **Comandos Principais**:
    - `/start`: Inicia a interface de comando.
    - `/radar`: Verifica o status operacional dos sistemas.
    - `/meu_id`: Retorna o ID do usuário (identificação de admin).
    - `/convocar`: Inicia protocolo de convocação de esquadrão.
    - `/analisar [MatchID]`: Solicita análise profunda ao Oráculo V (Varredura AUTO).

## 2. Gestão de Credenciais e Segurança

### Configuração de Ambiente
Todas as chaves sensíveis devem residir no arquivo `.env`. Nunca comite tokens reais para o repositório.
- `SUPABASE_URL` / `SUPABASE_SERVICE_KEY`: Instância principal do Protocolo V.
- `ORACULO_API_URL` / `ORACULO_API_KEY`: Endereço e chave da API REST do Oráculo V (ex: `http://localhost:3001`). Opcional — se ausente, briefings são enfileirados localmente em `match_analysis_queue`.
- `HENRIK_API_KEY`: Chave de autenticação (Produção/Hobby).
- `TELEGRAM_BOT_TOKEN`: Token do rádio central.
### Tratamento de Erros
- Chamadas externas utilizam retentativas (retries) em caso de **Rate Limit (429)**.
- O sistema loga falhas táticas na tabela `players.api_error` para visibilidade no painel administrativo.
- **Importante**: Falhas graves de segurança ou API devem ser notificadas via Telegram para o `ADMIN_TELEGRAM_ID`.
- **Sincronização**: O Protocolo V despacha briefings para o Oráculo V com timeout de 3s (fire-and-forget). Falhas não afetam o sync — briefings pendentes são salvos em `match_analysis_queue` e consumidos pelo Oráculo no próximo ciclo.

## 3. Estrutura de Dados (Supabase)
Tabelas essenciais utilizadas para integração:
- `players`: Perfis, ranks e pontuação de sinergia.
- `operations`: Histórico de partidas coletivas do clã.
- `match_analysis_queue`: Fila de processamento para o Oráculo V.
- `active_calls`: Sinais ativos de convocação no radar.
