# Sincronização de Perfil (Elo, Rank Máximo, Nível, Card)

## Contexto

Agentes como `ALT4O#easy`, `Fadinha Do FF#nobru`, `Ports#45225` e `fã da Lazio п#ssss` apareciam no painel com `current_rank = 'Processando...'` e sem `peak_rank`/`card_url`/`level`. O dado nunca evoluía, independente de quantas partidas o agente disputasse.

## Causa raiz

1. **Código órfão.** `services/player-worker.js` era a única peça capaz de buscar rank/peak/level da HenrikDev, mas **não era importada em lugar nenhum**. O worker rodava só na teoria.
2. **Sync principal ignorava perfil.** `src/update-data.js` atualizava apenas `synergy_score` e `last_match_id`. Rank, peak, level e card nunca eram tocados após o cadastro.
3. **`/vincular` usava endpoint errado.** O comando do Telegram chamava `v1/account/{name}/{tag}`, que não devolve `currenttierpatched`. Resultado: todo agente recém-vinculado entrava com `'Processando...'` e ficava parado lá.
4. **`peak_rank` nunca era gravado.** Nenhum caminho de código chamava `v2/mmr` para obter `highest_rank` — por isso o rank máximo aparecia perpetuamente como "Sem Rank" no card do portal.
5. **Comparação de nicks frágil.** Mesmo dentro do worker órfão, o match do jogador na resposta da API usava `p.name === name` sem `trim()` nem normalização Unicode — falhava para nicks com espaço (`Fadinha Do FF`), acentos (`fã`) ou alfabetos mistos (`п`).
6. **URL sem encoding no sync.** `update-data.js` concatenava `name` e `tag` crus na URL da HenrikDev. Espaços e caracteres não-ASCII quebravam a requisição para esses agentes específicos.
7. **Região hardcoded em `br`.** Contas com região diferente (ex: `na`, `latam`) falhavam silenciosamente com 404 no endpoint de MMR.

## Correção Implementada

### `services/player-worker.js`
- Exporta `fetchPlayerProfile(riotId, apiKey, region)` — função unificada e resiliente.
- **Detecção Dinâmica de Região**: Se a região não for passada, consulta `v1/account` para obter o campo `data.region` real da conta antes de chamar os endpoints regionais de MMR e partidas.
- **Mapeamento de 28 Tiers Competitivos**: Utiliza `TIER_NAME_MAP` cobrindo do Tier 0 (Sem Rank) ao Tier 27 (Radiante), convertendo corretamente o código numérico da Riot para nomenclatura oficial em português.
- **Extração de Pico e Ícone**:
  - Consulta `v2/mmr` para obter `highest_rank.tier` e `highest_rank.patched_tier`.
  - Constrói o ícone de pico diretamente a partir do tier numérico garantindo renderização nítida no portal.
- Normaliza o Riot ID com `normalize('NFC')`, `trim()` e `encodeURIComponent`.
- Retorna `{ is_ghost: true }` em HTTP 404, permitindo que o chamador trate contas inexistentes ou renomeadas.

### `src/update-data.js`
- Importa e utiliza `fetchPlayerProfile`.
- Para cada agente no roster, antes do scan de partidas, dispara o refresh de perfil **quando o dado está ausente, vencido (> 6 h) ou ainda em `'Processando...'`**. Isso respeita o rate limit da API HenrikDev (~10 req/min) sem deixar perfis obsoletos.
- Aplica `encodeURIComponent` + `normalize('NFC')` no nome/tag também na URL de `v3/matches`.
- Grava os campos de perfil na tabela `players`:
  `current_tier`, `current_tier_name`, `current_rank_icon`, `peak_tier_name`, `peak_rank_icon`, `level`, `card_url`, `region`, `updated_at`.

### `src/telegram-bot.js` (`/vincular`)
- Substitui a chamada isolada a `v1/account` por `fetchPlayerProfile`.
- Cadastra o novo agente já com rank atual, rank máximo, ícones, nível e card preenchidos.

## Como verificar

1. Rodar manualmente o sync:
   ```bash
   cd protocolov
   npm run sync
   ```
   Observe logs `[🎖️] <riot_id>: Perfil atualizado (<rank> / pico: <peak>)`.

2. No Supabase, conferir que os agentes passam a ter `current_rank_icon`, `peak_tier_name` e `peak_rank_icon` preenchidos após a execução.

3. No portal (`docs/index.html`), o card exibe o elo, ícone correspondente e badge de "Rank Máximo".

## Pré-requisito de schema

A tabela `players` utiliza as seguintes colunas de rank e perfil:

```sql
alter table public.players
    add column if not exists region text default 'br',
    add column if not exists current_tier int,
    add column if not exists current_tier_name text,
    add column if not exists current_rank_icon text,
    add column if not exists peak_tier_name text,
    add column if not exists peak_rank_icon text,
    add column if not exists tracker_link text;
```

## Observações operacionais

- A HenrikDev impõe rate limit de ~10 req/min por chave. O refresh condicional (apenas perfis com > 6 h ou incompletos) mantém a folga. Em execuções subsequentes no mesmo ciclo, a maioria dos agentes é pulada.
- Se um agente continuar sem `peak_tier_name` após o sync, é porque a conta nunca completou uma temporada competitiva — nesse caso `highest_rank` não existe na API da Riot, e o portal exibe "Sem Rank" como fallback legítimo.
- Agentes que retornarem 404 na HenrikDev são marcados internamente como `is_ghost` — protegendo as rotinas automáticas de sync.
- **Atenção ao GitHub Actions**: Se o repositório ficar sem commits por 60 dias, o GitHub suspende crons agendados automaticamente. Basta acessar a aba *Actions* no repositório do GitHub e reativar os workflows.

