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
        const url = `https://api.henrikdev.xyz/valorant/v3/match/${matchId}`;
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
                playerKillsInRound = stats.kills; // Henrik v3 returns Number here in some versions, or array in others. Oraculo.js previously used .length
                // Correction: stats.kills is usually a Number in this context, or an array if it's the full match data.
                // Let's check line 82: playerKillsInRound = stats.kills.length; 
                // So it's an array.
                playerKillsInRound = stats.kills.length;
                if (stats.was_killed) playerDiedInRound = true;
            }

            // Checar First Blood (Primeira eliminação do round)
            // Se round.kills existir e o primeiro killer for o player
            if (round.kills && round.kills.length > 0) {
                const firstKill = round.kills[0];
                if (firstKill.killer_display_name.toLowerCase() === playerTag.toLowerCase()) {
                    playerFirstBlood = true;
                    firstBloods++;
                }
            }

            // Identificar Eventos Táticos (Símbolos)
            let tacticalEvents = [];
            if (playerFirstBlood) tacticalEvents.push('FIRST_BLOOD');
            
            // Checar Plant/Defuse (Simulando baseado no comentário ou se disponível no round)
            if (round.bomb_planted && round.plant_events && round.plant_events.planted_by && round.plant_events.planted_by.display_name.toLowerCase() === playerTag.toLowerCase()) {
                tacticalEvents.push('TACTICAL_PLANT');
            }
            if (round.bomb_defused && round.defuse_events && round.defuse_events.defused_by && round.defuse_events.defused_by.display_name.toLowerCase() === playerTag.toLowerCase()) {
                tacticalEvents.push('TACTICAL_DEFUSE');
            }

            // Descrição tática simplificada
            let comment = "";
            if (playerFirstBlood) {
                comment = `Iniciativa de combate. Obteve o First Blood.`;
            } else if (playerKillsInRound > 0) {
                comment = `Eliminou ${playerKillsInRound} oponente(s). Volume de fogo eficaz.`;
            } else if (playerDiedInRound) {
                comment = `Agente neutralizado. Reavaliar cobertura operacional.`;
            } else {
                comment = `Posicionamento defensivo/suporte. Sem contato direto confirmado.`;
            }

            roundAnalyses.push({
                round: roundNumber,
                kills: playerKillsInRound,
                died: playerDiedInRound,
                comment: comment,
                impacto: playerKillsInRound > 0 || playerFirstBlood ? "Positivo" : (playerDiedInRound ? "Negativo" : "Neutro"),
                tactical_events: tacticalEvents
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
                conselho_kaio: alertas.length > 0 ? `${alertas.join(' ')} ${conselho}` : `✅ Protocolo V Cumprido. ${conselho}`,
                holt: holtResult,
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
