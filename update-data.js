const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const henrikApiKey = process.env.HENRIK_API_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Delay seguro de 2 segundos. Como temos poucas requisições agora, será super rápido.
const REQUEST_DELAY = 2000; 
const delay = ms => new Promise(res => setTimeout(res, ms));

async function smartFetch(url, headers, retries = 2) {
    const start = Date.now();
    let response = null; 
    let error = null;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
        response = await fetch(url, { headers, signal: controller.signal });
        clearTimeout(timeoutId);

        if (response.status === 429 && retries > 0) {
            console.log(`      ⛔ Rate Limit (429). Pausa de 45s...`);
            await delay(45000); 
            return smartFetch(url, headers, retries - 1);
        }
    } catch (e) { 
        clearTimeout(timeoutId);
        error = e; 
    }
    
    const remainingDelay = Math.max(0, REQUEST_DELAY - (Date.now() - start));
    if (remainingDelay > 0) await delay(remainingDelay);
    
    if (error) throw error;
    return response;
}

async function run() {
    try {
        console.log('--- PROTOCOLO V: SUPABASE SYNC ONLINE ---');
        console.log('1. A buscar inscritos e memória de operações no banco de dados...');
        
        // Puxa TODOS os dados (para podermos reutilizar Ranks de quem não jogou)
        const { data: records, error: dbError } = await supabase.from('players').select('*');
        if (dbError) throw new Error('Erro a ler jogadores do Supabase');

        const { data: opsRecords } = await supabase.from('operations').select('id').order('started_at', { ascending: false }).limit(500);
        const knownMatchIds = new Set(opsRecords ? opsRecords.map(op => op.id) : []);

        let playersToFetch = [];
        let rosterMap = new Set(); 
        const riotIdRegex = /^[^#]{2,16}#[a-zA-Z0-9]{3,5}$/;

        for (const record of records) {
            if (record.riot_id && riotIdRegex.test(record.riot_id.trim())) {
                playersToFetch.push({ role: record.role_raw, riotId: record.riot_id.trim(), dbRecord: record });
                rosterMap.add(record.riot_id.trim().toLowerCase().replace(/\s/g, ''));
            }
        }

        let finalPlayersData = [];
        let allMatchesMap = new Map(); 
        const headers = { 'Authorization': henrikApiKey };

        console.log(`2. A sincronizar dados de ${playersToFetch.length} agentes na API Valorant...`);

        for (const p of playersToFetch) {
            const [name, tag] = p.riotId.split('#');
            const safeName = encodeURIComponent(name.trim());
            const safeTag = encodeURIComponent(tag.trim());
            
            // Inicia com os dados antigos da base de dados (reutilização)
            let playerData = {
                riot_id: p.riotId, role_raw: p.role,
                tracker_link: p.dbRecord.tracker_link || `https://tracker.gg/valorant/profile/riot/${safeName}%23${safeTag}/overview`,
                level: p.dbRecord.level,
                card_url: p.dbRecord.card_url,
                current_rank: p.dbRecord.current_rank || 'Pendente',
                peak_rank: p.dbRecord.peak_rank,
                current_rank_icon: p.dbRecord.current_rank_icon,
                peak_rank_icon: p.dbRecord.peak_rank_icon,
                api_error: false,
                updated_at: new Date().toISOString()
            };

            let region = 'br'; 
            let hasNewMatches = false;

            try {
                // Reduzimos para as últimas 5 partidas (ninguém joga mais de 5 partidas em 30 min)
                let listRes = await smartFetch(`https://api.henrikdev.xyz/valorant/v3/matches/${region}/${safeName}/${safeTag}?size=5`, headers);
                if (listRes.status === 404) listRes = await smartFetch(`https://api.henrikdev.xyz/valorant/v3/matches/na/${safeName}/${safeTag}?size=5`, headers);

                if (listRes.status === 200) {
                    const listData = await listRes.json();
                    const recentCompMatches = listData.data ? listData.data.filter(m => m.metadata.mode.toLowerCase() === 'competitive') : [];

                    if (recentCompMatches.length > 0) {
                        for (const matchCandidate of recentCompMatches) {
                            const matchId = matchCandidate.metadata.matchid;
                            
                            if (allMatchesMap.has(matchId) || knownMatchIds.has(matchId)) continue;
                            
                            hasNewMatches = true;

                            // A GRANDE MUDANÇA: Usar os dados da lista diretamente! Zero requisições extras.
                            let bestMatch = matchCandidate;
                            if (bestMatch.players && !Array.isArray(bestMatch.players) && bestMatch.players.all_players) {
                                bestMatch.players = bestMatch.players.all_players;
                            }
                            allMatchesMap.set(matchId, bestMatch);
                        }
                    }
                } else {
                    playerData.api_error = true;
                }

                // Só gasta requisições na conta e rank se o jogador for novo ou tiver jogado partidas novas
                const isMissingData = !playerData.level || !playerData.current_rank || playerData.current_rank === 'Processando...';

                if ((hasNewMatches || isMissingData) && !playerData.api_error) {
                    const accRes = await smartFetch(`https://api.henrikdev.xyz/valorant/v1/account/${safeName}/${safeTag}`, headers);
                    if (accRes.status === 200) {
                        const accData = await accRes.json();
                        playerData.level = accData.data.account_level;
                        playerData.card_url = accData.data.card.small;
                        region = ['na', 'eu', 'latam', 'br'].includes(accData.data.region) ? accData.data.region : 'br';
                    }

                    const mmrRes = await smartFetch(`https://api.henrikdev.xyz/valorant/v2/mmr/${region}/${safeName}/${safeTag}`, headers);
                    if (mmrRes.status === 200) {
                        const mmrData = await mmrRes.json();
                        if (mmrData.data.current_data?.currenttierpatched) {
                            playerData.current_rank = mmrData.data.current_data.currenttierpatched;
                            playerData.current_rank_icon = mmrData.data.current_data.images.small;
                        }
                        if (mmrData.data.highest_rank?.patched_tier) {
                            playerData.peak_rank = mmrData.data.highest_rank.patched_tier;
                            const peakTier = mmrData.data.highest_rank.tier;
                            if (peakTier) playerData.peak_rank_icon = `https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/${peakTier}/smallicon.png`;
                        }
                    }
                }

            } catch (err) {
                console.error(`   [${p.riotId}] Falha: ${err.message}`);
                playerData.api_error = true;
            }

            finalPlayersData.push(playerData);
        }

        console.log(`3. A processar sinergia de operações...`);
        let operations = [];

        for (const [matchId, match] of allMatchesMap) {
            if (!match.players || !Array.isArray(match.players)) continue;

            const squadMembers = match.players.filter(player => rosterMap.has(`${player.name}#${player.tag}`.toLowerCase().replace(/\s/g, '')));

            if (squadMembers.length >= 2) {
                const teamId = squadMembers[0].team; 
                const teamData = match.teams ? match.teams[teamId.toLowerCase()] : null;
                const hasWon = teamData ? teamData.has_won : false;
                
                operations.push({
                    id: matchId, map: match.metadata.map, mode: match.metadata.mode,
                    started_at: match.metadata.game_start * 1000, 
                    score: match.teams ? `${match.teams.blue.rounds_won}-${match.teams.red.rounds_won}` : 'N/A',
                    result: hasWon ? 'VITÓRIA' : 'DERROTA', team_color: teamId,
                    squad: squadMembers.map(m => {
                        const totalHits = m.stats.headshots + m.stats.bodyshots + m.stats.legshots;
                        const hsPercent = totalHits > 0 ? Math.round((m.stats.headshots / totalHits) * 100) : 0;
                        return {
                            riotId: `${m.name}#${m.tag}`, agent: m.character, agentImg: m.assets.agent.small,
                            kda: `${m.stats.kills}/${m.stats.deaths}/${m.stats.assists}`, hs: hsPercent
                        };
                    })
                });
            }
        }
        
        // --- NOVO: LÓGICA DE PONTOS DE SINERGIA ---
        let newSynergyPoints = {};
        operations.forEach(op => {
            op.squad.forEach(m => {
                newSynergyPoints[m.riotId] = (newSynergyPoints[m.riotId] || 0) + 1;
            });
        });

        // Adiciona os pontos novos aos pontos que o jogador já tinha no banco de dados
        finalPlayersData = finalPlayersData.map(player => {
            const earnedPoints = newSynergyPoints[player.riot_id] || 0;
            const currentPoints = player.dbRecord ? (player.dbRecord.synergy_score || 0) : 0;
            return {
                ...player,
                synergy_score: currentPoints + earnedPoints
            };
        });
        // ------------------------------------------
        console.log('4. Guardando dados no Supabase...');
        const { error: pError } = await supabase.from('players').upsert(finalPlayersData, { onConflict: 'riot_id' });
        if (pError) console.error('Erro ao guardar jogadores:', pError);

        for (const op of operations) {
            const { error: opError } = await supabase.from('operations').upsert({
                id: op.id, map: op.map, mode: op.mode, started_at: op.started_at,
                score: op.score, result: op.result, team_color: op.team_color
            }, { onConflict: 'id' });

            if (!opError) {
                const squadData = op.squad.map(m => ({
                    operation_id: op.id, riot_id: m.riotId, agent: m.agent, agent_img: m.agentImg, kda: m.kda, hs_percent: m.hs
                }));
                await supabase.from('operation_squads').delete().eq('operation_id', op.id);
                await supabase.from('operation_squads').insert(squadData);
            }
        }
        
        console.log('✅ Sincronização concluída com sucesso!');

    } catch (error) {
        console.error('🔥 Erro fatal:', error);
        process.exit(1);
    }
}

run();
