/**
 * MATCH BRIEFING SERVICE
 * ======================
 * Serviço responsável por montar o payload estruturado de uma partida 
 * finalizada, unindo dados de `operations`, `operation_squads` e jogadores.
 * Produz um JSON normalizado para envio via POST ao Oráculo-V (/api/queue).
 *
 * Arquitetura:
 *   Protocolo-V DB (operations + operation_squads)
 *       ↓  buildMatchBriefing()
 *   JSON Estruturado (MatchBriefing)
 *       ↓  dispatchToOraculo()
 *   POST → Oráculo-V API (/api/queue)
 */

const { supabase } = require('../src/db');

const ORACULO_API_URL = process.env.ORACULO_API_URL || 'http://localhost:3000';
const ORACULO_API_KEY = process.env.ORACULO_API_KEY || '';

/**
 * Monta o briefing completo de uma partida a partir do banco Protocolo-V.
 *
 * @param {string} matchId - UUID da partida (operations.id)
 * @returns {Promise<Object|null>} MatchBriefing JSON ou null se não encontrar
 *
 * Retorna:
 * {
 *   match_id: "uuid",
 *   map_name: "Ascent",
 *   mode: "Competitive",
 *   started_at: 1711700000000,
 *   result: "VITÓRIA",
 *   score: "13-7",
 *   team_color: "Blue",
 *   squad: [
 *     {
 *       riot_id: "Player#TAG",
 *       agent: "Jett",
 *       agent_img: "https://...",
 *       kda: "22/10/5",
 *       kills: 22, deaths: 10, assists: 5,
 *       hs_percent: 28,
 *       kd_ratio: 2.20
 *     }
 *   ]
 * }
 */
async function buildMatchBriefing(matchId) {
    // 1. Buscar a operação com os membros do squad via FK join
    const { data: operation, error: opError } = await supabase
        .from('operations')
        .select(`
            id,
            map_name,
            mode,
            started_at,
            score,
            result,
            team_color,
            operation_squads (
                riot_id,
                agent,
                agent_img,
                kda,
                hs_percent
            )
        `)
        .eq('id', matchId)
        .single();

    if (opError || !operation) {
        console.error(`[BRIEFING] Operação ${matchId} não encontrada:`, opError?.message);
        return null;
    }

    // 2. Normalizar e enriquecer dados do squad
    const squad = (operation.operation_squads || []).map(member => {
        const [kills, deaths, assists] = (member.kda || '0/0/0').split('/').map(Number);
        const kd = deaths > 0 ? +(kills / deaths).toFixed(2) : kills;

        return {
            riot_id: member.riot_id,
            agent: member.agent,
            agent_img: member.agent_img || null,
            kda: member.kda,
            kills,
            deaths,
            assists,
            hs_percent: member.hs_percent || 0,
            kd_ratio: kd
        };
    })
    // Ordenar por kills (desc) → deaths (asc) → assists (desc)
    .sort((a, b) => {
        if (b.kills !== a.kills) return b.kills - a.kills;
        if (a.deaths !== b.deaths) return a.deaths - b.deaths;
        return b.assists - a.assists;
    });

    // 3. Montar o briefing final
    return {
        match_id: operation.id,
        map_name: operation.map_name,
        mode: operation.mode,
        started_at: operation.started_at,
        result: operation.result,
        score: operation.score,
        team_color: operation.team_color,
        squad_size: squad.length,
        squad
    };
}

/**
 * Monta briefings para as N partidas competitivas mais recentes.
 *
 * @param {number} limit - Quantidade de partidas (default: 10)
 * @param {string} [mode='Competitive'] - Filtro por modo
 * @returns {Promise<Array>} Lista de MatchBriefing
 */
async function buildRecentBriefings(limit = 10, mode = 'Competitive') {
    const { data: operations, error } = await supabase
        .from('operations')
        .select(`
            id,
            map_name,
            mode,
            started_at,
            score,
            result,
            team_color,
            operation_squads (
                riot_id,
                agent,
                agent_img,
                kda,
                hs_percent
            )
        `)
        .eq('mode', mode)
        .order('started_at', { ascending: false })
        .limit(limit);

    if (error || !operations) {
        console.error('[BRIEFING] Erro ao buscar operações recentes:', error?.message);
        return [];
    }

    return operations.map(op => {
        const squad = (op.operation_squads || []).map(member => {
            const [kills, deaths, assists] = (member.kda || '0/0/0').split('/').map(Number);
            const kd = deaths > 0 ? +(kills / deaths).toFixed(2) : kills;

            return {
                riot_id: member.riot_id,
                agent: member.agent,
                agent_img: member.agent_img || null,
                kda: member.kda,
                kills, deaths, assists,
                hs_percent: member.hs_percent || 0,
                kd_ratio: kd
            };
        }).sort((a, b) => {
            if (b.kills !== a.kills) return b.kills - a.kills;
            if (a.deaths !== b.deaths) return a.deaths - b.deaths;
            return b.assists - a.assists;
        });

        return {
            match_id: op.id,
            map_name: op.map_name,
            mode: op.mode,
            started_at: op.started_at,
            result: op.result,
            score: op.score,
            team_color: op.team_color,
            squad_size: squad.length,
            squad
        };
    });
}

/**
 * Envia o briefing de uma partida para a API do Oráculo-V.
 * Para cada membro do squad, envia um POST /api/queue individual.
 *
 * @param {Object} briefing - MatchBriefing gerado por buildMatchBriefing()
 * @param {Object} [options] - Configurações de envio
 * @param {boolean} [options.includeAuto=true] - Envia também o job AUTO
 * @param {boolean} [options.dryRun=false] - Se true, retorna payloads sem enviar
 * @returns {Promise<Object>} Resultado do dispatch: { sent, failed, payloads }
 */
async function dispatchToOraculo(briefing, options = {}) {
    const { includeAuto = true, dryRun = false } = options;

    if (!briefing || !briefing.squad || briefing.squad.length === 0) {
        console.warn('[DISPATCH] Briefing vazio ou sem squad. Abortando.');
        return { sent: 0, failed: 0, payloads: [] };
    }

    // Montar lista de payloads (1 por jogador + 1 AUTO opcional)
    const payloads = [];

    if (includeAuto) {
        payloads.push({
            player: 'AUTO',
            matchId: briefing.match_id
        });
    }

    for (const member of briefing.squad) {
        payloads.push({
            player: member.riot_id,
            matchId: briefing.match_id
        });
    }

    if (dryRun) {
        console.log(`[DISPATCH] Dry-run: ${payloads.length} payload(s) gerados para ${briefing.match_id}`);
        return { sent: 0, failed: 0, payloads };
    }

    // Enviar cada payload para POST /api/queue
    const endpoint = `${ORACULO_API_URL}/api/queue`;
    const headers = {
        'Content-Type': 'application/json',
        ...(ORACULO_API_KEY ? { 'x-api-key': ORACULO_API_KEY } : {})
    };

    let sent = 0;
    let failed = 0;
    const results = [];

    for (const payload of payloads) {
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload)
            });

            const body = await res.json();

            if (res.ok) {
                sent++;
                results.push({ player: payload.player, status: 'queued', response: body });
            } else {
                failed++;
                results.push({ player: payload.player, status: 'error', code: res.status, response: body });
            }
        } catch (err) {
            failed++;
            results.push({ player: payload.player, status: 'network_error', error: err.message });
        }
    }

    console.log(`[DISPATCH] ${briefing.match_id}: ${sent} enviados, ${failed} falharam`);
    return { sent, failed, payloads: results };
}

/**
 * Pipeline completo: Extrai → Monta → Envia.
 * Atalho para uso em automações (CI/CD, cron, update-data.js).
 *
 * @param {string} matchId - UUID da operação
 * @param {Object} [options] - Opções de dispatch
 * @returns {Promise<Object>} { briefing, dispatch }
 */
async function processAndDispatch(matchId, options = {}) {
    const briefing = await buildMatchBriefing(matchId);

    if (!briefing) {
        return { briefing: null, dispatch: { sent: 0, failed: 0, error: 'Operação não encontrada' } };
    }

    if (briefing.mode !== 'Competitive') {
        console.log(`[PIPELINE] ${matchId} não é Competitive (${briefing.mode}). Skipping dispatch.`);
        return { briefing, dispatch: { sent: 0, failed: 0, skipped: true, reason: 'non_competitive' } };
    }

    const dispatch = await dispatchToOraculo(briefing, options);
    return { briefing, dispatch };
}

// --- CLI Support ---
// Permite execução direta: node services/match-briefing.js <matchId> [--dry-run]
if (require.main === module) {
    const args = process.argv.slice(2);
    const matchId = args[0];
    const isDryRun = args.includes('--dry-run');
    const isRecent = args.includes('--recent');

    if (isRecent) {
        const limit = parseInt(args.find(a => /^\d+$/.test(a)) || '5');
        console.log(`\n📋 Gerando briefings das últimas ${limit} operações...\n`);

        buildRecentBriefings(limit).then(briefings => {
            if (briefings.length === 0) {
                console.log('Nenhuma operação encontrada.');
            } else {
                briefings.forEach((b, i) => {
                    console.log(`\n--- [${i + 1}/${briefings.length}] ${b.match_id} ---`);
                    console.log(JSON.stringify(b, null, 2));
                });
            }
            process.exit(0);
        });
    } else if (matchId) {
        console.log(`\n🎯 Extraindo briefing para: ${matchId}`);
        console.log(`   Mode: ${isDryRun ? 'DRY-RUN' : 'LIVE'}\n`);

        processAndDispatch(matchId, { dryRun: isDryRun }).then(({ briefing, dispatch }) => {
            if (briefing) {
                console.log('\n📦 MATCH BRIEFING:');
                console.log(JSON.stringify(briefing, null, 2));
                console.log('\n📡 DISPATCH RESULT:');
                console.log(JSON.stringify(dispatch, null, 2));
            } else {
                console.log('❌ Operação não encontrada.');
            }
            process.exit(0);
        });
    } else {
        console.log('Uso:');
        console.log('  node services/match-briefing.js <matchId>           Extrai e envia para o Oráculo');
        console.log('  node services/match-briefing.js <matchId> --dry-run  Apenas exibe o JSON');
        console.log('  node services/match-briefing.js --recent [N]         Lista últimas N partidas');
        process.exit(0);
    }
}

module.exports = {
    buildMatchBriefing,
    buildRecentBriefings,
    dispatchToOraculo,
    processAndDispatch
};
