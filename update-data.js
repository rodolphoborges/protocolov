// update-data.js
const fs = require('fs');
const { parse } = require('csv-parse/sync');

const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSFrlbFvaPDuVahEtPUOJdt4EfIBzCJvHITDIR5cEDHcFCBTEofMe_-gG57bSh5KCuqD2dnzuaFn66p/pub?output=csv';
const henrikApiKey = process.env.HENRIK_API_KEY;
const debugTarget = process.env.DEBUG_TARGET || ''; // Ex: 'ousadia#013'

const delay = ms => new Promise(res => setTimeout(res, ms));

// Função auxiliar para tentar fetch em múltiplas regiões se necessário
async function fetchWithRegionFallback(endpointBase, name, tag, initialRegion) {
    const headers = { 'Authorization': henrikApiKey };
    
    // Tenta a região original primeiro
    let url = `https://api.henrikdev.xyz/valorant/${endpointBase}/${initialRegion}/${name}/${tag}`;
    let res = await fetch(url, { headers });
    
    // Se falhar e a região não for BR, tenta BR como fallback (comum para contas antigas migradas)
    if (res.status === 404 && initialRegion !== 'br') {
        console.warn(`   ⚠️ ${endpointBase} não encontrado em '${initialRegion}'. Tentando 'br'...`);
        url = `https://api.henrikdev.xyz/valorant/${endpointBase}/br/${name}/${tag}`;
        res = await fetch(url, { headers });
    }
    
    return res;
}

async function run() {
    try {
        console.log('--- PROTOCOLO V: UPDATE SYSTEM v2.0 ---');
        
        // 1. LER E PARSEAR CSV (ROBUSTO)
        console.log('1. Baixando e processando planilha...');
        const response = await fetch(csvUrl);
        const csvText = await response.text();
        
        // Usa biblioteca para parsear CSV corretamente (lida com aspas, vírgulas internas, etc)
        const records = parse(csvText, {
            columns: true,
            skip_empty_lines: true,
            trim: true
        });

        let playersToFetch = [];
        let rosterMap = new Set(); 
        
        // Identifica colunas dinamicamente (insensitive case)
        const keys = Object.keys(records[0]);
        const roleKey = keys.find(k => k.toLowerCase().includes('fun'));
        const riotIdKey = keys.find(k => k.toLowerCase().includes('riot'));

        if (!roleKey || !riotIdKey) {
            throw new Error('Colunas "Função" ou "Riot ID" não encontradas no CSV.');
        }

        for (const record of records) {
            const role = record[roleKey];
            const riotId = record[riotIdKey];
            
            if (role && riotId && riotId.includes('#')) {
                playersToFetch.push({ role, riotId });
                rosterMap.add(riotId.toLowerCase().replace(/\s/g, ''));
            }
        }
        console.log(`Agentes identificados: ${playersToFetch.length}`);

        let finalPlayersData = [];
        let allMatchesMap = new Map(); 
        const headers = { 'Authorization': henrikApiKey };

        // 2. BUSCAR DADOS
        for (const [index, p] of playersToFetch.entries()) {
            console.log(`[${index + 1}/${playersToFetch.length}] Processando: ${p.riotId}`);
            const [name, tag] = p.riotId.split('#');
            const safeName = encodeURIComponent(name.trim());
            const safeTag = encodeURIComponent(tag.trim());

            let playerData = {
                riotId: p.riotId,
                roleRaw: p.role,
                trackerLink: `https://tracker.gg/valorant/profile/riot/${safeName}%23${safeTag}/overview`,
                level: '--',
                card: 'https://media.valorant-api.com/playercards/9fb348bc-41a0-91ad-8a3e-818035c4e561/smallart.png',
                currentRank: 'Sem Rank',
                peakRank: 'Sem Rank',
                currentRankIcon: '',
                peakRankIcon: '',
                apiError: false
            };

            let region = 'br'; // Default inicial

            try {
                // A. Conta
                await delay(1000); 
                const accRes = await fetch(`https://api.henrikdev.xyz/valorant/v1/account/${safeName}/${safeTag}`, { headers });
                
                if (accRes.status === 200) {
                    const accData = await accRes.json();
                    playerData.level = accData.data.account_level;
                    playerData.card = accData.data.card.small;
                    region = accData.data.region;
                }

                // B. MMR (Com Fallback de Região Inteligente)
                await delay(1000);
                const mmrRes = await fetchWithRegionFallback('v2/mmr', safeName, safeTag, region);
                
                if (mmrRes.status === 200) {
                    const mmrData = await mmrRes.json();
                    if (mmrData.data.current_data?.currenttierpatched) {
                        playerData.currentRank = mmrData.data.current_data.currenttierpatched;
                        playerData.currentRankIcon = mmrData.data.current_data.images.small;
                    }
                    if (mmrData.data.highest_rank?.patched_tier) {
                        playerData.peakRank = mmrData.data.highest_rank.patched_tier;
                        const peakTier = mmrData.data.highest_rank.tier;
                        if (peakTier > 2) {
                            playerData.peakRankIcon = `https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/${peakTier}/smallicon.png`;
                        }
                    }
                }

                // C. Histórico (Anti-Ghost + Fallback Região)
                await delay(1500); 
                // Tenta buscar partidas. Se a região da conta for NA mas joga no BR, o fallback corrige.
                let matchesRes = await fetch(`https://api.henrikdev.xyz/valorant/v3/matches/${region}/${safeName}/${safeTag}?mode=competitive&size=10`, { headers });
                
                if (matchesRes.status === 404 && region !== 'br') {
                     matchesRes = await fetch(`https://api.henrikdev.xyz/valorant/v3/matches/br/${safeName}/${safeTag}?mode=competitive&size=10`, { headers });
                }

                if (matchesRes.status === 200) {
                    const matchesData = await matchesRes.json();
                    if (matchesData.data && matchesData.data.length > 0) {
                        
                        const validMatch = matchesData.data.find(m => m.players && Array.isArray(m.players) && m.players.length > 0);

                        // Debug Condicional via Variável de Ambiente
                        if (debugTarget && p.riotId.includes(debugTarget) && validMatch) {
                            console.log(`   🔍 DEBUG (${debugTarget}): Analisando partida ${validMatch.metadata.matchid} (${validMatch.metadata.map})`);
                        }

                        if ((playerData.currentRank === 'Sem Rank' || playerData.currentRank === 'Unranked') && validMatch) {
                            const playerInMatch = validMatch.players.find(pl => pl.name.toLowerCase() === name.trim().toLowerCase() && pl.tag.toLowerCase() === tag.trim().toLowerCase());
                            if (playerInMatch?.currenttier_patched) {
                                playerData.currentRank = playerInMatch.currenttier_patched;
                                if (playerInMatch.currenttier > 2) {
                                    playerData.currentRankIcon = `https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/${playerInMatch.currenttier}/smallicon.png`;
                                }
                            }
                        }

                        matchesData.data.forEach(match => {
                            if (match.players && Array.isArray(match.players) && !allMatchesMap.has(match.metadata.matchid)) {
                                allMatchesMap.set(match.metadata.matchid, match);
                            }
                        });
                    }
                }

            } catch (err) {
                console.error(`   ! Erro em ${p.riotId}: ${err.message}`);
                playerData.apiError = true;
            }

            finalPlayersData.push(playerData);
            await delay(12000); 
        }

        // 3. SINERGIA
        console.log(`Cruzando dados de ${allMatchesMap.size} partidas...`);
        let operations = [];

        for (const [matchId, match] of allMatchesMap) {
            const squadMembers = match.players.filter(player => {
                const fullName = `${player.name}#${player.tag}`.toLowerCase().replace(/\s/g, '');
                return rosterMap.has(fullName);
            });

            if (squadMembers.length >= 2) {
                const teamId = squadMembers[0].team; 
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

        const finalOutput = {
            updatedAt: Date.now(),
            players: finalPlayersData,
            operations: operations
        };

        fs.writeFileSync('data.json', JSON.stringify(finalOutput, null, 2));
        console.log(`Concluído: ${finalPlayersData.length} Jogadores, ${operations.length} Operações.`);

    } catch (error) {
        console.error('Erro fatal:', error);
        process.exit(1);
    }
}

run();
