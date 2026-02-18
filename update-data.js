// update-data.js
const fs = require('fs');
const { parse } = require('csv-parse/sync');

const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSFrlbFvaPDuVahEtPUOJdt4EfIBzCJvHITDIR5cEDHcFCBTEofMe_-gG57bSh5KCuqD2dnzuaFn66p/pub?output=csv';
const henrikApiKey = process.env.HENRIK_API_KEY;
const debugTarget = process.env.DEBUG_TARGET || 'ousadia';

// --- CONFIGURAÇÃO ---
const REQUEST_DELAY = 10000; 

const delay = ms => new Promise(res => setTimeout(res, ms));

async function smartFetch(url, headers, retries = 2) {
    const start = Date.now();
    let response = null;
    let error = null;

    try {
        response = await fetch(url, { headers });
        if (response.status === 429 && retries > 0) {
            console.log(`      ⛔ 429 Detectado. Pausa de 45s...`);
            await delay(45000); 
            return smartFetch(url, headers, retries - 1);
        }
    } catch (e) { error = e; }

    const elapsed = Date.now() - start;
    const remainingDelay = Math.max(0, REQUEST_DELAY - elapsed);
    if (remainingDelay > 0) await delay(remainingDelay);

    if (error) throw error;
    return response;
}

async function run() {
    try {
        console.log('--- PROTOCOLO V: V2 FALLBACK MODE ---');
        
        let oldDataMap = new Map();
        try {
            if (fs.existsSync('data.json')) {
                const jsonOld = JSON.parse(fs.readFileSync('data.json'));
                (Array.isArray(jsonOld) ? jsonOld : (jsonOld.players || [])).forEach(p => oldDataMap.set(p.riotId, p));
            }
        } catch (e) { }

        console.log('   A descarregar planilha...');
        const response = await fetch(csvUrl);
        const records = parse(await response.text(), { columns: true, skip_empty_lines: true, trim: true });
        
        const keys = Object.keys(records[0]);
        const roleKey = keys.find(k => k.toLowerCase().includes('fun'));
        const riotIdKey = keys.find(k => k.toLowerCase().includes('riot'));

        if (!roleKey || !riotIdKey) throw new Error('Colunas CSV inválidas.');

        let playersToFetch = [];
        let rosterMap = new Set(); 
        
        for (const record of records) {
            if (record[roleKey] && record[riotIdKey] && record[riotIdKey].includes('#')) {
                playersToFetch.push({ role: record[roleKey], riotId: record[riotIdKey] });
                rosterMap.add(record[riotIdKey].toLowerCase().replace(/\s/g, ''));
            }
        }

        let finalPlayersData = [];
        let allMatchesMap = new Map(); 
        const headers = { 'Authorization': henrikApiKey };

        for (const [index, p] of playersToFetch.entries()) {
            console.log(`\n[${index + 1}/${playersToFetch.length}] 🔍 A analisar: ${p.riotId}`);
            
            const [name, tag] = p.riotId.split('#');
            const safeName = encodeURIComponent(name.trim());
            const safeTag = encodeURIComponent(tag.trim());
            const cachedPlayer = oldDataMap.get(p.riotId);
            
            let playerData = {
                riotId: p.riotId, roleRaw: p.role,
                trackerLink: `https://tracker.gg/valorant/profile/riot/${safeName}%23${safeTag}/overview`,
                level: cachedPlayer?.level || '--',
                card: cachedPlayer?.card || 'https://media.valorant-api.com/playercards/9fb348bc-41a0-91ad-8a3e-818035c4e561/smallart.png',
                currentRank: cachedPlayer?.currentRank || 'Sem Rank',
                peakRank: cachedPlayer?.peakRank || 'Sem Rank',
                currentRankIcon: cachedPlayer?.currentRankIcon || '',
                peakRankIcon: cachedPlayer?.peakRankIcon || '',
                lastMatchId: cachedPlayer?.lastMatchId || null,
                apiError: false
            };

            let needsFullUpdate = true;
            let region = 'br'; 

            try {
                // ETAPA 1: Buscar LISTA (v3 ainda é bom para listar IDs)
                let listRes = await smartFetch(`https://api.henrikdev.xyz/valorant/v3/matches/${region}/${safeName}/${safeTag}?size=5`, headers);
                
                if (listRes.status === 404) {
                     listRes = await smartFetch(`https://api.henrikdev.xyz/valorant/v3/matches/na/${safeName}/${safeTag}?size=5`, headers);
                }

                if (listRes.status === 200) {
                    const listData = await listRes.json();
                    const recentCompMatches = listData.data ? listData.data.filter(m => m.metadata.mode.toLowerCase() === 'competitive') : [];

                    if (recentCompMatches.length > 0) {
                        let bestMatch = null;

                        for (const matchCandidate of recentCompMatches) {
                            const matchId = matchCandidate.metadata.matchid;

                            // 1. Já temos no cache de equipa?
                            if (allMatchesMap.has(matchId)) {
                                console.log(`   ✨ Detalhes recuperados do cache de equipa.`);
                                bestMatch = allMatchesMap.get(matchId);
                                break;
                            }

                            // 2. Tenta baixar detalhes usando V2 (A MUDANÇA ESTÁ AQUI)
                            console.log(`   📥 Tentando baixar detalhes de ${matchId} (API v2)...`);
                            const detailRes = await smartFetch(`https://api.henrikdev.xyz/valorant/v2/match/${matchId}`, headers);
                            
                            if (detailRes.status === 200) {
                                const detailData = await detailRes.json();
                                bestMatch = detailData.data;

                                // --- CORREÇÃO DE COMPATIBILIDADE V2 ---
                                // A v2 retorna { players: { all_players: [...] } } em vez de { players: [...] }
                                if (bestMatch.players && !Array.isArray(bestMatch.players) && bestMatch.players.all_players) {
                                    bestMatch.players = bestMatch.players.all_players;
                                }
                                // --------------------------------------

                                allMatchesMap.set(matchId, bestMatch);
                                break;
                            } else {
                                console.log(`      ❌ Falha no ID ${matchId} (Status ${detailRes.status}).`);
                            }
                        }

                        if (bestMatch) {
                            // Atualiza Rank
                            const playerInMatch = bestMatch.players.find(pl => pl.name.toLowerCase() === name.trim().toLowerCase() && pl.tag.toLowerCase() === tag.trim().toLowerCase());
                            
                            if (cachedPlayer && cachedPlayer.lastMatchId === bestMatch.metadata.matchid && cachedPlayer.currentRank !== 'Sem Rank') {
                                console.log(`   ⚡ Rank mantido do cache.`);
                                needsFullUpdate = false;
                                playerData = { ...cachedPlayer, roleRaw: p.role, lastMatchId: bestMatch.metadata.matchid };
                            } else {
                                console.log(`   🔄 Atualizando Rank via partida ${bestMatch.metadata.matchid}...`);
                                playerData.lastMatchId = bestMatch.metadata.matchid;
                                if (playerInMatch?.currenttier_patched) {
                                    playerData.currentRank = playerInMatch.currenttier_patched;
                                    if (playerInMatch.currenttier > 2) {
                                        playerData.currentRankIcon = `https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/${playerInMatch.currenttier}/smallicon.png`;
                                    }
                                }
                            }
                        } else {
                            console.log(`   ⚠️ Não foi possível recuperar detalhes (v2 falhou também).`);
                        }
                    } else {
                        console.log(`   ℹ️ Nenhuma partida competitiva recente.`);
                    }
                } else {
                    console.log(`   ❌ Erro lista: ${listRes.status}`);
                    playerData.apiError = true;
                }

                if (needsFullUpdate) {
                    const accRes = await smartFetch(`https://api.henrikdev.xyz/valorant/v1/account/${safeName}/${safeTag}`, headers);
                    if (accRes.status === 200) {
                        const accData = await accRes.json();
                        playerData.level = accData.data.account_level;
                        playerData.card = accData.data.card.small;
                        region = ['na', 'eu', 'latam', 'br'].includes(accData.data.region) ? accData.data.region : 'br';
                    }

                    const mmrRes = await smartFetch(`https://api.henrikdev.xyz/valorant/v2/mmr/${region}/${safeName}/${safeTag}`, headers);
                    if (mmrRes.status === 200) {
                        const mmrData = await mmrRes.json();
                        if (mmrData.data.current_data?.currenttierpatched) {
                            playerData.currentRank = mmrData.data.current_data.currenttierpatched;
                            playerData.currentRankIcon = mmrData.data.current_data.images.small;
                        }
                        if (mmrData.data.highest_rank?.patched_tier) {
                            playerData.peakRank = mmrData.data.highest_rank.patched_tier;
                        }
                    }
                }

            } catch (err) {
                console.error(`   ❌ Erro: ${err.message}`);
                if (cachedPlayer) playerData = cachedPlayer;
                else playerData.apiError = true;
            }

            finalPlayersData.push(playerData);
        }

        console.log(`\n⚙️ Processando Sinergia (${allMatchesMap.size} partidas únicas)...`);
        let operations = [];

        for (const [matchId, match] of allMatchesMap) {
            // Garante que é array (graças à correção de compatibilidade v2 lá em cima)
            if (!match.players || !Array.isArray(match.players)) continue;

            const squadMembers = match.players.filter(player => {
                const fullName = `${player.name}#${player.tag}`.toLowerCase().replace(/\s/g, '');
                return rosterMap.has(fullName);
            });

            if (squadMembers.length >= 2) {
                const names = squadMembers.map(m => m.name).join(', ');
                console.log(`   ✅ SQUAD CONFIRMADO: ${names} (${match.metadata.map})`);

                const teamId = squadMembers[0].team; 
                // v2 e v3 têm estrutura de teams parecida, mas bom garantir
                const teamData = match.teams ? match.teams[teamId.toLowerCase()] : null;
                const hasWon = teamData ? teamData.has_won : false;
                const scoreStr = match.teams ? `${match.teams.blue.rounds_won}-${match.teams.red.rounds_won}` : 'N/A';
                
                operations.push({
                    id: matchId,
                    map: match.metadata.map,
                    mode: match.metadata.mode,
                    started_at: match.metadata.game_start,
                    score: scoreStr,
                    result: hasWon ? 'VITÓRIA' : 'DERROTA',
                    team_color: teamId,
                    squad: squadMembers.map(m => ({
                        riotId: `${m.name}#${m.tag}`,
                        agent: m.character,
                        agentImg: m.assets.agent.small,
                        kda: `${m.stats.kills}/${m.stats.deaths}/${m.stats.assists}`,
                        hs: Math.round((m.stats.headshots / (m.stats.headshots + m.stats.bodyshots + m.stats.legshots)) * 100) || 0
                    }))
                });
            }
        }

        operations.sort((a, b) => b.started_at - a.started_at);

        const finalOutput = { updatedAt: Date.now(), players: finalPlayersData, operations: operations };
        
        fs.writeFileSync('data.temp.json', JSON.stringify(finalOutput, null, 2));
        fs.renameSync('data.temp.json', 'data.json');
        
        console.log(`✅ Sucesso! ${operations.length} Operações salvas.`);

    } catch (error) {
        console.error('🔥 Erro fatal:', error);
        process.exit(1);
    }
}

run();
