require('dotenv').config();

const henrikApiKey = process.env.HENRIK_API_KEY;

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

        // 3. Calcular Performance Index (0-100) - K.A.I.O. Heuristic
        const adrScore = Math.min(100, (adr / 200) * 100);
        const kdScore = Math.min(100, (parseFloat(kd) / 2.0) * 100);
        const performanceIndex = Math.round((0.6 * adrScore) + (0.4 * kdScore));

        // 4. Analisar Rounds e Doutrina
        const roundAnalyses = [];

        match.rounds.forEach((round, index) => {
            const roundNumber = index + 1;
            let playerKillsInRound = 0;
            let playerDiedInRound = false;

            // Analisa o desempenho do player no round
            const stats = round.player_stats.find(ps => 
                ps.player_display_name.toLowerCase() === playerTag.toLowerCase()
            );

            if (stats) {
                playerKillsInRound = stats.kills.length;
                if (stats.was_killed) playerDiedInRound = true;
            }

            // Descrição tática simplificada baseada no resultado do round
            let comment = "";
            if (playerKillsInRound > 0) {
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
                impacto: playerKillsInRound > 0 ? "Positivo" : (playerDiedInRound ? "Negativo" : "Neutro")
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
                adr: adr,
                acs: acs,
                kd: kd,
                conselho_kaio: alertas.length > 0 ? `${alertas.join(' ')} ${conselho}` : `✅ Protocolo V Cumprido. ${conselho}`,
                rounds: roundAnalyses,
                doctrine_violations: alertas,
                focus_point: adr < 130 ? "Volume de Dano" : (parseFloat(kd) < 1.0 ? "Posicionamento" : "Sinergia de Squad"),
                synergy_comment: parseFloat(kd) > 1.2 && adr > 150 ? "Liderança de Campo Detectada" : "Cooperação operacional padrão"
            }
        };

    } catch (error) {
        console.error(`Erro na análise Oráculo-V (${matchId}):`, error);
        return { status: 'failed', error: error.message };
    }
}

module.exports = { analyzeMatch };
