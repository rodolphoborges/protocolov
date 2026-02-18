// update-data.js
const fs = require('fs');
const { parse } = require('csv-parse/sync');

const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSFrlbFvaPDuVahEtPUOJdt4EfIBzCJvHITDIR5cEDHcFCBTEofMe_-gG57bSh5KCuqD2dnzuaFn66p/pub?output=csv';
const henrikApiKey = process.env.HENRIK_API_KEY;
const debugTarget = process.env.DEBUG_TARGET || 'ousadia';

// --- CONFIGURAÇÃO DE SEGURANÇA MÁXIMA ---
// 10 segundos entre chamadas = 6 req/min. 
// Lento, mas é a única forma de evitar o bloqueio 429/504 no estado atual da API.
const REQUEST_DELAY = 10000; 

const delay = ms => new Promise(res => setTimeout(res, ms));

async function smartFetch(url, headers, retries = 3) {
    const start = Date.now();
    let response = null;
    let error = null;

    try {
        response = await fetch(url, { headers });
        
        // Tratamento Agressivo de Erros de Servidor
        if ((response.status === 429 || response.status >= 500) && retries > 0) {
            console.log(`      ⛔ Instabilidade API (${response.status}). Pausa longa de 45s...`);
            await delay(45000); 
            return smartFetch(url, headers, retries - 1);
        }

    } catch (e) {
        error = e;
    }

    const elapsed = Date.now() - start;
    const remainingDelay = Math.max(0, REQUEST_DELAY - elapsed);
    if (remainingDelay > 0) await delay(remainingDelay);

    if (error) throw error;
    return response;
}

async function run() {
    try {
        console.log('--- PROTOCOLO V: RESILIENT MODE (MULTI-TRY) ---');
        
        // 1. CARREGAR CACHE
        let oldDataMap = new Map();
        try {
            if (fs.existsSync('data.json')) {
                const jsonOld = JSON.parse(fs.readFileSync('data.json'));
                (Array.isArray(jsonOld) ? jsonOld : (jsonOld.players || [])).forEach(p => oldDataMap.set(p.riotId, p));
            }
        } catch (e) { console.log('   Nenhum cache válido encontrado.'); }

        // 2. LER CSV
        console.log('   A descarregar planilha...');
        const response = await fetch(csvUrl);
        const records = parse(await response.text(), { columns: true, skip_empty_lines: true, trim: true });
        
        const keys = Object.keys(records[0]);
        const roleKey = keys.find(k => k.toLowerCase().includes('fun'));
        const riotIdKey = keys.find(k => k.toLowerCase().includes('riot'));

        if (!roleKey || !riotIdKey) throw new Error('Colunas obrigatórias não encontradas.');

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

        // 3. LOOP DE DADOS
        for (const [index, p] of playersToFetch.entries()) {
            console.log(`\n[${index + 1}/${playersToFetch.length}] 🔍 A analisar: ${p.riotId}`);
            
            const [name, tag] = p.riotId.split('#');
            const safeName = encodeURIComponent(name.trim());
            const safeTag = encodeURIComponent(tag.trim());
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
                lastMatchId: cachedPlayer?.lastMatchId || null,
                apiError: false
            };

            let needsFullUpdate = true;
            let region = 'br'; 

            try {
                // ETAPA 1: Buscar LISTA
                let listRes = await smartFetch(`https://api.henrikdev.xyz/valorant/v3/matches/${region}/${safeName}/${safeTag}?size=10`, headers);
                
                if (listRes.status === 404) {
                     console.log('   ⚠️ Região BR não encontrada. Tentando NA...');
                     listRes = await smartFetch(`https://api.henrikdev.xyz/valorant/v3/matches/na/${safeName}/${safeTag}?size=10`, headers);
                }

                if (listRes.status === 200) {
                    const listData = await listRes.json();
                    
                    // PEGA AS 3 ÚLTIMAS COMPETITIVAS (Backup caso a primeira esteja quebrada/404)
                    const recentCompMatches = listData.data 
                        ? listData.data.filter(m => m.metadata.mode.toLowerCase() === 'competitive').slice(0, 3)
                        : [];

                    if (recentCompMatches.length > 0) {
                        let validMatchFound = null;

                        // LOOP DE TENTATIVAS (Try 1 -> Try 2 -> Try 3)
                        for (const matchCandidate of recentCompMatches) {
                            const matchId = matchCandidate.metadata.matchid;
                            
                            // 1. Já temos baixado?
                            if (allMatchesMap.has(matchId)) {
                                console.log(`   ✨ Partida ${matchId} recuperada da memória.`);
                                validMatchFound = allMatchesMap.get(matchId);
                                break; // Sucesso, sai do loop
                            }

                            // 2. Tentar baixar detalhes
                            console.log(`   📥 Tentando baixar detalhes de ${matchId}...`);
                            const detailRes = await smartFetch(`https://api.henrikdev.xyz/valorant/v3/match/${matchId}`, headers);
                            
                            if (detailRes.status === 200) {
                                const detailData = await detailRes.json();
                                validMatchFound = detailData.data;
                                allMatchesMap.set(matchId, validMatchFound); // Salva para todos
                                break; // Sucesso, sai do loop
                            } else {
                                console.log(`      ❌ Falha no ID ${matchId} (Status ${detailRes.status}). Tentando a próxima...`);
                                // Não dá break, continua para a próxima partida do histórico
                            }
                        }

                        // SE ENCONTRAMOS ALGUMA PARTIDA VÁLIDA (Atual ou Anterior)
                        if (validMatchFound) {
                            // Atualiza Rank com base nessa partida válida
                            const playerInMatch = validMatchFound.players.find(pl => pl.name.toLowerCase() === name.trim().toLowerCase() && pl.tag.toLowerCase() === tag.trim().toLowerCase());
                            
                            // Lógica de Cache Inteligente
                            // Se o ID da partida válida for igual ao último salvo, mantemos o cache
                            if (cachedPlayer && cachedPlayer.lastMatchId === validMatchFound.metadata.matchid && cachedPlayer.currentRank !== 'Sem Rank') {
                                console.log(`   ⚡ Cache confirmado (Baseado na partida ${validMatchFound.metadata.matchid}).`);
                                needsFullUpdate = false;
                                playerData = { ...cachedPlayer, roleRaw: p.role, lastMatchId: validMatchFound.metadata.matchid };
                            } else {
                                console.log(`   🔄 Atualizando Rank via partida ${validMatchFound.metadata.matchid}...`);
                                playerData.lastMatchId = validMatchFound.metadata.matchid;
                                
                                if (playerInMatch?.currenttier_patched) {
                                    playerData.currentRank = playerInMatch.currenttier_patched;
                                    if (playerInMatch.currenttier > 2) {
                                        playerData.currentRankIcon = `https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/${playerInMatch.currenttier}/smallicon.png`;
                                    }
                                }
                            }
                        } else {
                            console.log(`   ⚠️ Todas as 3 últimas partidas competitivas deram erro na API.`);
                        }

                    } else {
                        console.log(`   ℹ️ Nenhuma partida competitiva recente.`);
                    }
                } else {
                    console.log(`   ❌ Erro ao buscar lista: ${listRes.status}`);
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

        // 4. SINERGIA
        console.log(`\n⚙️ Processando Sinergia (${allMatchesMap.size} partidas únicas recuperadas)...`);
        let operations = [];

        for (const [matchId, match] of allMatchesMap) {
            if (!match.players || !Array.isArray(match.players)) continue;

            const squadMembers = match.players.filter(player => {
                const fullName = `${player.name}#${player.tag}`.toLowerCase().replace(/\s/g, '');
                return rosterMap.has(fullName);
            });

            if (squadMembers.length >= 2) {
                const names = squadMembers.map(m => m.name).join(', ');
                console.log(`   ✅ SQUAD CONFIRMADO: ${names} (${match.metadata.map})`);

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
