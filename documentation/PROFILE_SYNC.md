# Sincronização de Perfil (Elo, Rank Máximo, Nível, Card)

## Contexto

Agentes como `ALT4O#easy`, `Fadinha Do FF#nobru`, `Ports#45225` e `fã da Lazio п#ssss` apareciam no painel com `current_rank = 'Processando...'` e sem `peak_rank`/`card_url`/`level`. O dado nunca evoluía, independente de quantas partidas o agente disputasse.

## Causa raiz

1. **Código órfão.** `services/player-worker.js` era a única peça capaz de buscar rank/peak/level da HenrikDev, mas **não era importada em lugar nenhum**. O worker rodava só na teoria.
2. **Sync principal ignorava perfil.** `src/update-data.js` (executado a cada 30 min pelos workflows `update.yml` e `sync_matches.yml`) atualizava apenas `synergy_score` e `last_match_id`. Rank, peak, level e card nunca eram tocados após o cadastro.
3. **`/vincular` usava endpoint errado.** O comando do Telegram chamava `v1/account/{name}/{tag}`, que não devolve `currenttierpatched`. Resultado: todo agente recém-vinculado entrava com `'Processando...'` e ficava parado lá, já que o passo (1) nunca executava a atualização seguinte.
4. **`peak_rank` nunca foi gravado.** Nenhum caminho de código chamava `v2/mmr` para obter `highest_rank` — por isso o rank máximo aparecia perpetuamente como "Sem Rank" no card do portal.
5. **Comparação de nicks frágil.** Mesmo dentro do worker órfão, o match do jogador na resposta da API usava `p.name === name` sem `trim()` nem normalização Unicode — falhava para nicks com espaço (`Fadinha Do FF`), acentos (`fã`) ou alfabetos mistos (`п`).
6. **URL sem encoding no sync.** `update-data.js` concatenava `name` e `tag` crus na URL da HenrikDev. Espaços e caracteres não-ASCII quebravam a requisição para esses agentes específicos.

## Correção

### `services/player-worker.js`
- Exporta `fetchPlayerProfile(riotId, apiKey, region)` — função única e reaproveitável.
- Faz duas chamadas: `v1/account` (para `level` e `card_url`) e `v2/mmr` (para `current_rank`, `current_rank_icon`, `peak_rank`, `peak_rank_icon`).
- Normaliza o Riot ID com `normalize('NFC')`, `trim()` e `encodeURIComponent`.
- Retorna `{ is_ghost: true }` em 404, permitindo que o caller trate o agente fantasma.
- A classe `PlayerWorker` (mantida para compat) agora usa comparações normalizadas de nome/tag e delega a parte de rank/peak para `fetchPlayerProfile`.

### `src/update-data.js`
- Importa `fetchPlayerProfile`.
- Para cada agente no roster, antes do scan de partidas, dispara o refresh de perfil **quando o dado está ausente, vencido (> 6 h) ou ainda em `'Processando...'`**. Isso limita a carga na API HenrikDev (≈10 req/min) sem deixar perfis estagnarem.
- Aplica `encodeURIComponent` + `normalize('NFC')` no nome/tag também da URL de `v3/matches`.
- Nova etapa 2.5 grava os campos de perfil na tabela `players` (`current_rank`, `current_rank_icon`, `peak_rank`, `peak_rank_icon`, `level`, `card_url`, `updated_at`).

### `src/telegram-bot.js` (`/vincular`)
- Substitui a chamada direta a `v1/account` por `fetchPlayerProfile`.
- Insere o novo agente já com rank atual, rank máximo, ícones, nível e card preenchidos. 404 devolve a mesma mensagem de "nick não encontrado".

## Como verificar

1. Rodar manualmente o sync:
   ```bash
   cd protocolov
   npm run sync
   ```
   Observe logs `[🎖️] <riot_id>: Perfil atualizado (<rank> / pico: <peak>)`.

2. No Supabase, conferir que os 4 agentes passam a ter `current_rank`, `peak_rank`, `card_url` e `level` preenchidos após a primeira execução.

3. No portal (`docs/index.html`), o card passa a mostrar elo e "Rank Máximo" com o ícone correto.

## Pré-requisito de schema

A tabela `players` precisa ter as colunas abaixo. Se o Supabase retornar erro do tipo `column "peak_rank" does not exist`, rode a migração:

```sql
alter table public.players
    add column if not exists current_rank_icon text,
    add column if not exists peak_rank text,
    add column if not exists peak_rank_icon text;
```

`current_rank`, `level`, `card_url` e `updated_at` já eram usados pelo `/vincular` e existem desde o schema original.

## Observações operacionais

- A HenrikDev impõe rate limit de ~10 req/min por chave. O refresh condicional (apenas perfis com > 6 h ou incompletos) mantém a folga. Em execuções subsequentes no mesmo ciclo, a maioria dos agentes é pulada.
- Se um agente continuar sem `peak_rank` após o sync, é porque a conta nunca completou o placement competitivo — nesse caso o `highest_rank.patched_tier` simplesmente não existe na resposta da API, e o card mostra "Sem Rank" como fallback legítimo.
- Agentes que retornarem 404 na HenrikDev são marcados internamente como `is_ghost` — candidatos a limpeza manual.
