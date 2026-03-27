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
- `ORACULO_SUPABASE_URL` / `ORACULO_SUPABASE_SERVICE_KEY`: Instância do motor Oráculo V (Necessário para a fila de análise `AUTO`).
- `HENRIK_API_KEY`: Chave de autenticação (Produção/Hobby).
- `TELEGRAM_BOT_TOKEN`: Token do rádio central.
### Tratamento de Erros
- Chamadas externas utilizam retentativas (retries) em caso de **Rate Limit (429)**.
- O sistema loga falhas táticas na tabela `players.api_error` para visibilidade no painel administrativo.
- **Importante**: Falhas graves de segurança ou API devem ser notificadas via Telegram para o `ADMIN_TELEGRAM_ID`.
- **Sincronização**: O Protocolo V sincroniza automaticamente com o Oráculo V se as credenciais estiverem presentes. Caso contrário, a ingestão de partidas ocorre normalmente no Supabase principal, mas as ordens de análise não são enfileiradas.

## 3. Estrutura de Dados (Supabase)
Tabelas essenciais utilizadas para integração:
- `players`: Perfis, ranks e pontuação de sinergia.
- `operations`: Histórico de partidas coletivas do clã.
- `match_analysis_queue`: Fila de processamento para o Oráculo V.
- `active_calls`: Sinais ativos de convocação no radar.
