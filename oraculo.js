require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const henrikApiKey = process.env.HENRIK_API_KEY;
const oraculoUrl = process.env.ORACULO_SUPABASE_URL;
const oraculoKey = process.env.ORACULO_SUPABASE_SERVICE_KEY;

// Inicializa o cliente para histórico (Holt-Winters)
const oraculoDb = (oraculoUrl && oraculoKey) ? createClient(oraculoUrl, oraculoKey) : null;

/**
 * Funçao helper para fetch com retentativa básica (para o motor analítico)
 */
async function smartFetch(url, headers, retries = 2) {
    try {
        const response = await fetch(url, { headers });
        if (response.status === 429 && retries > 0) {
            console.log("   ⏳ Rate limit detectado. Aguardando 15s...");
            await new Promise(res => setTimeout(res, 15000));
            return smartFetch(url, headers, retries - 1);
        }
        return response;
    } catch (e) {
        if (retries > 0) return smartFetch(url, headers, retries - 1);
        throw e;
    }
}

/**
 * ORÁCULO-V Core Analysis Engine v3.0
 * Based on vStats Logic and Protocolo V Doctrine.
 */

async function analyzeMatch(matchId, playerTag) {
    const [name, tag] = playerTag.split('#');
    const headers = { 'Authorization': henrikApiKey };
    const region = 'br';

    try {
        const url = `https://api.henrikdev.xyz/valorant/v2/match/${matchId}`;
        const res = await smartFetch(url, headers);
        
        if (res.status !== 200) {
            throw new Error(`Falha ao buscar partida: ${res.status}`);
        }

        const matchData = await res.json();
        const match = matchData.data;

        // 1. Identificar o jogador
        const player = match.players.all_players.find(p => 
            p.name.toLowerCase() === name.toLowerCase() && 
            p.tag.toLowerCase() === tag.toLowerCase()
        );

        if (!player) {
            throw new Error("Jogador não encontrado nesta partida.");
        }

        // 2. Extrair Métricas Básicas
        const roundsPlayed = match.metadata.rounds_played;
        const kills = player.stats.kills;
        const deaths = Math.max(player.stats.deaths, 1);
        const assists = player.stats.assists;
        const adr = Math.round(player.damage_made / roundsPlayed);
        const acs = Math.round(player.stats.score / roundsPlayed);
        const kd = (kills / deaths).toFixed(2);
        
        // 3. Baselines e Status (Doutrina Oráculo-V)
        const metaKd = 1.15; // Baseline padrão para agentes de Impacto
        const performanceStatus = kd >= metaKd ? 'ABOVE_BASELINE' : 'BELOW_BASELINE';

        // 3. Calcular Performance Index (0-100) - K.A.I.O. Heuristic
        const adrScore = Math.min(100, (adr / 200) * 100);
        const kdScore = Math.min(100, (parseFloat(kd) / 2.0) * 100);
        const performanceIndex = Math.round((0.6 * adrScore) + (0.4 * kdScore));

        // --- NOVO: LÓGICA HOLT-WINTERS (DES) ---
        let holtResult = {
            performance_l: null, performance_t: null,
            adr_l: null, adr_t: null,
            kd_l: null, kd_t: null,
            performance_forecast: null, adr_forecast: null, kd_forecast: null
        };

        if (oraculoDb) {
            try {
                // Busca a última análise COMPLETA do jogador
                const { data: history } = await oraculoDb
                    .from('match_analysis_queue')
                    .select('metadata')
                    .eq('agente_tag', playerTag)
                    .eq('status', 'completed')
                    .neq('match_id', matchId)
                    .order('created_at', { ascending: false })
                    .limit(1);

                const alpha = 0.4; // Reatividade
                const beta = 0.15; // Estabilidade da tendência

                const calculateHolt = (current, prevL, prevT) => {
                    if (prevL === null || prevL === undefined) {
                        return { l: current, t: 0 };
                    }
                    const l = alpha * current + (1 - alpha) * (prevL + prevT);
                    const t = beta * (l - prevL) + (1 - beta) * prevT;
                    return { l, t };
                };

                const prevHolt = history && history[0] && history[0].metadata && history[0].metadata.analysis && history[0].metadata.analysis.holt 
                    ? history[0].metadata.analysis.holt 
                    : null;

                // 1. Performance Index
                const perfHolt = calculateHolt(performanceIndex, prevHolt?.performance_l, prevHolt?.performance_t);
                holtResult.performance_l = perfHolt.l;
                holtResult.performance_t = perfHolt.t;
                holtResult.performance_forecast = perfHolt.l + perfHolt.t;

                // 2. ADR
                const adrHolt = calculateHolt(adr, prevHolt?.adr_l, prevHolt?.adr_t);
                holtResult.adr_l = adrHolt.l;
                holtResult.adr_t = adrHolt.t;
                holtResult.adr_forecast = adrHolt.l + adrHolt.t;

                // 3. KD
                const kdHolt = calculateHolt(parseFloat(kd), prevHolt?.kd_l, prevHolt?.kd_t);
                holtResult.kd_l = kdHolt.l;
                holtResult.kd_t = kdHolt.t;
                holtResult.kd_forecast = kdHolt.l + kdHolt.t;

            } catch (holtErr) {
                console.warn("⚠️ Falha ao calcular Holt-Winters:", holtErr.message);
            }
        }

        // 4. Analisar Rounds e Doutrina
        let firstBloods = 0;
        let firstDeaths = 0;
        const roundAnalyses = [];
        match.rounds.forEach((round, index) => {
            const roundNumber = index + 1;
            let playerKillsInRound = 0;
            let playerDiedInRound = false;
            let playerFirstBlood = false;

            // Analisa o desempenho do player no round
            const stats = round.player_stats.find(ps => 
                ps.player_display_name.toLowerCase() === playerTag.toLowerCase()
            );
            if (stats) {
                playerKillsInRound = Array.isArray(stats.kills) ? stats.kills.length : (parseInt(stats.kills) || 0);
                if (stats.was_killed) playerDiedInRound = true;
            }

            // Checar First Blood (Primeira eliminação do round) - ORDENADO POR TEMPO
            const roundKills = (match.kills || []).filter(k => k.round === index);
            let isFirstDeathThisRound = false;

            if (roundKills.length > 0) {
                // Ordenar kills por tempo para garantir que pegamos o FB real
                const sortedKills = [...roundKills].sort((a, b) => {
                    const timeA = a.kill_time_in_round || a.time_in_round_ms || 0;
                    const timeB = b.kill_time_in_round || b.time_in_round_ms || 0;
                    return timeA - timeB;
                });

                const firstKill = sortedKills[0];
                const killerName = firstKill.killer_display_name || "";
                const victimName = firstKill.victim_display_name || "";
                
                // Normalização para comparação robusta
                const normalize = (str) => (str || "").toLowerCase().trim();
                const targetName = normalize(name);
                const targetTag = normalize(tag);
                const targetFull = normalize(playerTag);

                const checkMatch = (dispName, puuid) => {
                    if (player.puuid && puuid === player.puuid) return true;
                    const normalizedDisp = normalize(dispName);
                    return normalizedDisp === targetFull || 
                           normalizedDisp === targetName || 
                           normalizedDisp.split('#')[0] === targetName;
                };

                // Identificação robusta do Killer (First Blood)
                if (checkMatch(killerName, firstKill.killer_puuid)) {
                    playerFirstBlood = true;
                    firstBloods++;
                }

                // Identificação robusta da Vítima (First Death)
                if (checkMatch(victimName, firstKill.victim_puuid)) {
                    isFirstDeathThisRound = true;
                    firstDeaths++;
                }
            }

            // Identificar Eventos Táticos (Símbolos)
            let tacticalEvents = [];
            if (playerFirstBlood) tacticalEvents.push('FIRST_BLOOD');
            if (isFirstDeathThisRound) tacticalEvents.push('FIRST_DEATH');
            
            // Checar Plant/Defuse (Simulando baseado no comentário ou se disponível no round)
            if (round.bomb_planted && round.plant_events && round.plant_events.planted_by && round.plant_events.planted_by.display_name.toLowerCase() === playerTag.toLowerCase()) {
                tacticalEvents.push('TACTICAL_PLANT');
            }
            if (round.bomb_defused && round.defuse_events && round.defuse_events.defused_by && round.defuse_events.defused_by.display_name.toLowerCase() === playerTag.toLowerCase()) {
                tacticalEvents.push('TACTICAL_DEFUSE');
            }

            // 5. Gerar Comentário Variado (Protocolo V Doctrine)
            const phrases = {
                fb: [
                    "Iniciativa de combate. Obteve o First Blood.",
                    "Abertura agressiva. Garantiu a primeira vantagem numérica do round.",
                    "Entry de alto impacto. Oponente neutralizado no primeiro contato.",
                    "Domínio inicial. Você abriu o round com uma eliminação limpa."
                ],
                fd: [
                    "Primeira baixa do round. Sua eliminação abriu brecha tática para o inimigo.",
                    "Vulnerabilidade inicial explorada. Oponente obteve o First Blood sobre você.",
                    "Neutralizado precocemente. Reavaliar postura ofensiva ou agressividade.",
                    "Entrada punida. O inimigo antecipou seu movimento inicial."
                ],
                multi: [
                    `Eliminou ${playerKillsInRound} oponentes. Volume de fogo excepcional.`,
                    `Limpa de setor efetuada. ${playerKillsInRound} baixas confirmadas.`,
                    `Multi-kill detectado. Domínio total da área com ${playerKillsInRound} eliminações.`,
                    `Presença intimidadora. Neutralizou ${playerKillsInRound} alvos neste setor.`
                ],
                kills: [
                    "Eliminação confirmada. Oponente neutralizado.",
                    "Troca de tiro favorável. Garantiu uma baixa para o time.",
                    "Impacto pontual no round. Um alvo neutralizado.",
                    "Combate eficaz. Você venceu o duelo direto."
                ],
                died: [
                    "Agente neutralizado. Reavaliar cobertura operacional.",
                    "Baixa sofrida em combate. Trade-kill não foi possível.",
                    "Neutralização confirmada. Posicionamento foi comprometido.",
                    "Fim de linha neste round. Oponente levou a melhor no combate."
                ],
                neutral: [
                    "Posicionamento defensivo/suporte. Sem contato direto confirmado.",
                    "Foco em utilitários e suporte tático. Preservou a vida.",
                    "Movimentação estratégica. Round de baixo contato direto.",
                    "Protocolo de sobrevivência. Evitou confrontos desnecessários."
                ]
            };

            const getRandom = (arr) => arr[Math.floor((matchId.charCodeAt(0) + index) % arr.length)];
            
            let comment = "";
            let hsCount = stats?.headshots || 0;

            if (playerFirstBlood) {
                comment = getRandom(phrases.fb);
            } else if (isFirstDeathThisRound) {
                comment = getRandom(phrases.fd);
            } else if (playerKillsInRound > 1) {
                comment = getRandom(phrases.multi);
            } else if (playerKillsInRound === 1) {
                comment = getRandom(phrases.kills);
            } else if (playerDiedInRound) {
                comment = getRandom(phrases.died);
            } else {
                comment = getRandom(phrases.neutral);
            }

            if (hsCount > 0 && playerKillsInRound > 0) {
                comment += ` (${hsCount} HS confirmados).`;
            }

            roundAnalyses.push({
                round: roundNumber,
                kills: playerKillsInRound,
                died: playerDiedInRound,
                comment: comment,
                impacto: playerKillsInRound > 0 || playerFirstBlood ? "Positivo" : (playerDiedInRound ? "Negativo" : "Neutro"),
                tactical_events: tacticalEvents,
                fb: playerFirstBlood,
                fd: isFirstDeathThisRound
            });
        });

        // 5. Gerar Conselho K.A.I.O
        let conselho = "";
        let alertas = [];

        if (adr < 130) {
            alertas.push("Art. 1 (Dano Absoluto): Violação de Impacto detectada.");
            conselho = "Seu ADR está abaixo da meta operacional (130). Você está sendo um 'passivo' no mapa. Aumente o volume de fogo.";
        } else if (parseFloat(kd) < 1.0) {
            alertas.push("Art. 2 (Eficiência de Combate): Baixa taxa de sobrevida.");
            conselho = "Apesar do dano, sua taxa de conversão em abates/sobrevida está baixa. Melhore o trade-kill.";
        } else {
            conselho = "Impacto tático dentro dos parâmetros. Continue mantendo a pressão constante sobre os setores inimigos.";
        }

        // --- NOVO: ALERTAS DE TENDÊNCIA (HOLT-WINTERS) ---
        if (holtResult.performance_t !== null) {
            const t = holtResult.performance_t;
            const tPerc = (Math.abs(t)).toFixed(1);
            if (t > 5) {
                alertas.unshift(`📈 ALERTA DE EVOLUÇÃO: Tendência de performance positiva identificada (+${tPerc}). Seu nível técnico está em ascensão constante.`);
            } else if (t < -5) {
                alertas.unshift(`📉 ALERTA DE QUEDA: Tendência de performance negativa identificada (-${tPerc}). Seu nível técnico está oscilando para baixo. Reavalie sua postura tática antes da próxima partida.`);
            }
        }

        // 6. Estimativa de Rank e Categoria (Heurística vStats)
        let estimatedRank = "PLATINA";
        if (performanceIndex >= 90) estimatedRank = "RADIANTE";
        else if (performanceIndex >= 80) estimatedRank = "IMORTAL";
        else if (performanceIndex >= 70) estimatedRank = "ASCENDENTE";
        else if (performanceIndex >= 60) estimatedRank = "DIAMANTE";
        else if (performanceIndex >= 50) estimatedRank = "PLATINA";
        else if (performanceIndex >= 40) estimatedRank = "OURO";
        else if (performanceIndex >= 30) estimatedRank = "PRATA";
        else estimatedRank = "BRONZE";

        let metaCategory = "VSTATS // TACTICAL";
        if (adr > 165) metaCategory = "ASSAULT // VSTATS";
        else if (firstBloods >= 2) metaCategory = "ENTRY // VSTATS";
        else if (performanceIndex > 70) metaCategory = "ELITE // VSTATS";

        return {
            status: 'completed',
            report: {
                player: playerTag,
                matchId: matchId,
                performance_index: performanceIndex,
                performance_status: performanceStatus,
                adr: adr,
                acs: acs,
                kd: kd,
                meta_kd: metaKd,
                first_bloods: firstBloods,
                first_deaths: firstDeaths,
                conselho_kaio: alertas.length > 0 ? `${alertas.join(' ')} ${conselho}` : `✅ Protocolo V Cumprido. ${conselho}`,
                holt: holtResult,
                estimated_rank: estimatedRank,
                meta_category: metaCategory,
                total_rounds: roundsPlayed,
                rounds: roundAnalyses,
                doctrine_violations: alertas,
                focus_point: (() => {
                    if (adr > 165 && firstBloods >= 3) return "DUELISTA NATO (ENTRY)";
                    if (adr > 165) return "DANO BRUTO (AMASSANDO)";
                    if (firstBloods >= 3) return "PRESSÃO INICIAL (ENTRY)";
                    if (parseFloat(kd) > 1.6 && adr < 135) return "KDA PLAYER (BAITADOR?)";
                    if (parseFloat(kd) < 0.85 && (match.rounds.filter(r => r.player_stats.find(ps => ps.player_display_name.toLowerCase() === playerTag.toLowerCase())?.was_killed).length / roundsPlayed) > 0.8) return "FALTA DE TRADE / ISOLADO";
                    if (parseFloat(kd) >= 1.0) return "JOGANDO O FINO";
                    return "ABAIXO DO IMPACTO ESPERADO";
                })(),
                synergy_comment: (() => {
                    const deathRatio = match.rounds.filter(r => r.player_stats.find(ps => ps.player_display_name.toLowerCase() === playerTag.toLowerCase())?.was_killed).length / roundsPlayed;
                    if (parseFloat(kd) < 0.85 && deathRatio > 0.8) return "JOGANDO NO ESCURO (SEM TRADE)";
                    if (parseFloat(kd) > 1.2 && firstBloods >= 2) return "DOMÍNIO DE MAPA / LIDERANÇA";
                    return "COOPERAÇÃO OPERACIONAL";
                })()
            }
        };

    } catch (error) {
        console.error(`Erro na análise Oráculo-V (${matchId}):`, error);
        return { status: 'failed', error: error.message };
    }
}

module.exports = { analyzeMatch };
