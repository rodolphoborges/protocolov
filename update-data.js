// update-data.js
const fs = require('fs');
const { parse } = require('csv-parse/sync');

const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSFrlbFvaPDuVahEtPUOJdt4EfIBzCJvHITDIR5cEDHcFCBTEofMe_-gG57bSh5KCuqD2dnzuaFn66p/pub?output=csv';
const henrikApiKey = process.env.HENRIK_API_KEY;
const debugTarget = process.env.DEBUG_TARGET || '';

// Delay reduzido porque agora faremos menos chamadas!
const delay = ms => new Promise(res => setTimeout(res, ms));

async function run() {
    try {
        console.log('--- PROTOCOLO V: SMART UPDATE SYSTEM ---');
        
        // 1. CARREGAR CACHE ANTERIOR (Para comparar)
        let oldDataMap = new Map();
        try {
            if (fs.existsSync('data.json')) {
                const rawOld = fs.readFileSync('data.json');
                const jsonOld = JSON.parse(rawOld);
                const playersOld = Array.isArray(jsonOld) ? jsonOld : (jsonOld.players || []);
                
                playersOld.forEach(p => {
                    // Mapeia pelo Riot ID para fácil acesso
                    oldDataMap.set(p.riotId, p);
                });
                console.log(`Cache anterior carregado: ${playersOld.length} jogadores.`);
            }
        } catch (e) {
            console.log('Nenhum cache anterior válido encontrado. Começando do zero.');
        }

        // 2. LER CSV
        console.log('Baixando planilha...');
        const response = await fetch(csvUrl);
        const csvText = await response.text();
        const records = parse(csvText, { columns: true, skip_empty_lines: true, trim: true });

        const keys = Object.keys(records[0]);
        const roleKey = keys.find(k => k.toLowerCase().includes('fun'));
        const riotIdKey = keys.find(k => k.toLowerCase().includes('riot'));

        if (!roleKey || !riotIdKey) throw new Error('Colunas CSV não encontradas.');

        let playersToFetch = [];
        let rosterMap = new Set(); 
        
        for (const record of records) {
            const role = record[roleKey];
            const riotId = record[riotIdKey];
            if (role && riotId && riotId.includes('#')) {
                playersToFetch.push({ role, riotId });
                rosterMap.add(riotId.toLowerCase().replace(/\s/g, ''));
            }
        }

        let finalPlayersData = [];
        let allMatchesMap = new Map(); 
        const headers = { 'Authorization': henrikApiKey };

        // 3. LOOP INTELIGENTE
        for (const [index, p] of playersToFetch.entries()) {
            console.log(`[${index + 1}/${playersToFetch.length}] Verificando: ${p.riotId}`);
            const [name, tag] = p.riotId.split('#');
            const safeName = encodeURIComponent(name.trim());
            const safeTag = encodeURIComponent(tag.trim());

            // Recupera dados antigos se existirem
            const cachedPlayer = oldDataMap.get(p.riotId);
            
            let playerData = {
                riotId: p.riotId,
                roleRaw: p.role,
                trackerLink: `https://tracker.gg/valorant/profile/riot/${safeName}%23${safeTag}/overview`,
                level: cachedPlayer?.level || '--',
                card: cachedPlayer?.card || 'https://media.valorant-api.com/playercards/9fb348bc-41a0-91ad-8a3e-818035c4e561/smallart.png',
                currentRank: cachedPlayer?.currentRank || 'Sem Rank',
                peakRank: cachedPlayer?.peakRank || 'Sem Rank',
                currentRankIcon: cachedPlayer?.currentRankIcon || '',
                peakRankIcon: cachedPlayer?.peakRankIcon || '',
                lastMatchId: cachedPlayer?.lastMatchId || null, // Novo campo para controle
                apiError: false
            };

            let needsFullUpdate = true; // Por padrão, atualizamos tudo
            let region = 'br';

            try {
                // PASSO 1: Buscar APENAS o histórico primeiro (1 chamada)
                // Usamos delay pequeno pois é só uma chamada inicial
                await delay(1500); 
                
                let matchesRes = await fetch(`https://api.henrikdev.xyz/valorant/v3/matches/${region}/${safeName}/${safeTag}?mode=competitive&size=5`, { headers });
                
                // Fallback de região se 404
                if (matchesRes.status === 404) {
                     matchesRes = await fetch(`https://api.henrikdev.xyz/valorant/v3/matches/br/${safeName}/${safeTag}?mode=competitive&size=5`, { headers });
                }

                if (matchesRes.status === 200) {
                    const matchesData = await matchesRes.json();
                    if (matchesData.data && matchesData.data.length > 0) {
                        const validMatch = matchesData.data.find(m => m.players && Array.isArray(m.players));
                        
                        if (validMatch) {
                            const newMatchId = validMatch.metadata.matchid;
                            
                            // AQUI ESTÁ A MÁGICA:
                            // Se o último match ID for igual ao que já temos, NÃO ATUALIZAMOS O RESTO!
                            if (cachedPlayer && cachedPlayer.lastMatchId === newMatchId && cachedPlayer.currentRank !== 'Sem Rank') {
                                console.log(`   ⚡ Sem novidades. Usando cache.`);
                                needsFullUpdate = false; 
                                playerData = { ...cachedPlayer, roleRaw: p.role }; // Mantém dados, atualiza só a role se mudou no CSV
                            } else {
                                console.log(`   🔄 Nova partida detetada (ou cache vazio). Atualizando tudo...`);
                                playerData.lastMatchId = newMatchId;
                                
                                // Fallback de Rank via Histórico (já que já temos os dados na mão)
                                const playerInMatch = validMatch.players.find(pl => pl.name.toLowerCase() === name.trim().toLowerCase() && pl.tag.toLowerCase() === tag.trim().toLowerCase());
                                if (playerInMatch?.currenttier_patched) {
                                    playerData.currentRank = playerInMatch.currenttier_patched;
                                    if (playerInMatch.currenttier > 2) {
                                        playerData.currentRankIcon = `https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/${playerInMatch.currenttier}/smallicon.png`;
                                    }
                                }
                            }

                            // Sempre guardamos as partidas para a Sinergia
                            matchesData.data.forEach(match => {
                                if (match.players && Array.isArray(match.players) && !allMatchesMap.has(match.metadata.matchid)) {
                                    allMatchesMap.set(match.metadata.matchid, match);
                                }
                            });
                        }
                    }
                }

                // PASSO 2: Buscar Conta e MMR (SÓ SE NECESSÁRIO)
                if (needsFullUpdate) {
                    await delay(1000); 
                    const accRes = await fetch(`https://api.henrikdev.xyz/valorant/v1/account/${safeName}/${safeTag}`, { headers });
                    if (accRes.status === 200) {
                        const accData = await accRes.json();
                        playerData.level = accData.data.account_level;
                        playerData.card = accData.data.card.small;
                        region = accData.data.region === 'na' || accData.data.region === 'latam' ? 'br' : accData.data.region;
                    }

                    await delay(1000);
                    const mmrRes = await fetch(`https://api.henrikdev.xyz/valorant/v2/mmr/${region}/${safeName}/${safeTag}`, { headers });
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
                console.error(`   ! Erro: ${err.message}`);
                // Em caso de erro, tenta manter os dados antigos
                if (cachedPlayer) playerData = cachedPlayer;
                else playerData.apiError = true;
            }

            finalPlayersData.push(playerData);
            
            // Se usou cache, o delay pode ser menor. Se fez full update, delay maior.
            if (needsFullUpdate) await delay(5000); 
            else await delay(500); // Super rápido se for cache
        }

        // 4. SINERGIA
        console.log(`\nProcessando Sinergia (${allMatchesMap.size} partidas)...`);
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
        console.log(`Sucesso!`);

    } catch (error) {
        console.error('Erro fatal:', error);
        process.exit(1);
    }
}

run();
