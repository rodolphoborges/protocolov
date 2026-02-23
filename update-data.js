const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const henrikApiKey = process.env.HENRIK_API_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const REQUEST_DELAY = 8000;
const delay = ms => new Promise(res => setTimeout(res, ms));

async function smartFetch(url, headers, retries = 2) {
    const start = Date.now();
    let response = null; let error = null;
    try {
        response = await fetch(url, { headers });
        if (response.status === 429 && retries > 0) {
            console.log(`      ⛔ Rate Limit (429). Pausa de 45s...`);
            await delay(45000); 
            return smartFetch(url, headers, retries - 1);
        }
    } catch (e) { error = e; }
    const remainingDelay = Math.max(0, REQUEST_DELAY - (Date.now() - start));
    if (remainingDelay > 0) await delay(remainingDelay);
    if (error) throw error;
    return response;
}

async function run() {
    try {
        console.log('--- PROTOCOLO V: SUPABASE SYNC ONLINE ---');
        console.log('1. A buscar inscritos no banco de dados...');
        
        const { data: records, error: dbError } = await supabase.from('players').select('riot_id, role_raw');
        if (dbError) throw new Error('Erro a ler jogadores do Supabase');

        let playersToFetch = [];
        let rosterMap = new Set(); 
        
        for (const record of records) {
            if (record.riot_id && record.riot_id.includes('#')) {
                playersToFetch.push({ role: record.role_raw, riotId: record.riot_id });
                rosterMap.add(record.riot_id.toLowerCase().replace(/\s/g, ''));
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
            
            let playerData = {
                riot_id: p.riotId, role_raw: p.role,
                tracker_link: `https://tracker.gg/valorant/profile/riot/${safeName}%23${safeTag}/overview`,
                api_error: false
            };

            let region = 'br'; 

            try {
                let listRes = await smartFetch(`https://api.henrikdev.xyz/valorant/v3/matches/${region}/${safeName}/${safeTag}?size=5`, headers);
                if (listRes.status === 404) listRes = await smartFetch(`https://api.henrikdev.xyz/valorant/v3/matches/na/${safeName}/${safeTag}?size=5`, headers);

                if (listRes.status === 200) {
                    const listData = await listRes.json();
                    const recentCompMatches = listData.data ? listData.data.filter(m => m.metadata.mode.toLowerCase() === 'competitive') : [];

                    if (recentCompMatches.length > 0) {
                        for (const matchCandidate of recentCompMatches) {
                            const matchId = matchCandidate.metadata.matchid;
                            if (allMatchesMap.has(matchId)) continue;
                            
                            const detailRes = await smartFetch(`https://api.henrikdev.xyz/valorant/v2/match/${matchId}`, headers);
                            if (detailRes.status === 200) {
                                const detailData = await detailRes.json();
                                let bestMatch = detailData.data;
                                if (bestMatch.players && !Array.isArray(bestMatch.players) && bestMatch.players.all_players) {
                                    bestMatch.players = bestMatch.players.all_players;
                                }
                                allMatchesMap.set(matchId, bestMatch);
                            }
                        }
                    }
                } else {
                    playerData.api_error = true;
                }

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
                    }
                }

            } catch (err) {
                console.error(`   [${p.riotId}] Falha: ${err.message}`);
                playerData.api_error = true;
            }

            finalPlayersData.push(playerData);
        }

        console.log(`3. A calcular sinergia (${allMatchesMap.size} partidas únicas)...`);
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
                    squad: squadMembers.map(m => ({
                        riotId: `${m.name}#${m.tag}`, agent: m.character, agentImg: m.assets.agent.small,
                        kda: `${m.stats.kills}/${m.stats.deaths}/${m.stats.assists}`,
                        hs: Math.round((m.stats.headshots / (m.stats.headshots + m.stats.bodyshots + m.stats.legshots)) * 100) || 0
                    }))
                });
            }
        }

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
