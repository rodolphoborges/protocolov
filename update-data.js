// update-data.js
const fs = require('fs');
const { parse } = require('csv-parse/sync');

const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSFrlbFvaPDuVahEtPUOJdt4EfIBzCJvHITDIR5cEDHcFCBTEofMe_-gG57bSh5KCuqD2dnzuaFn66p/pub?output=csv';
const henrikApiKey = process.env.HENRIK_API_KEY;
const debugTarget = process.env.DEBUG_TARGET || '';

// --- CONFIGURAÇÃO DE SEGURANÇA ---
const REQUEST_DELAY = 3500; 

const delay = ms => new Promise(res => setTimeout(res, ms));

async function smartFetch(url, headers) {
    const start = Date.now();
    let response = null;
    let error = null;

    try {
        response = await fetch(url, { headers });
    } catch (e) {
        error = e;
    }

    const elapsed = Date.now() - start;
    const remainingDelay = Math.max(0, REQUEST_DELAY - elapsed);
    
    if (remainingDelay > 0) {
        await delay(remainingDelay);
    }

    if (error) throw error;
    return response;
}

async function run() {
    try {
        console.log('--- PROTOCOLO V: DEEP SEARCH MODE ---');
        
        // 1. CARREGAR CACHE
        let oldDataMap = new Map();
        try {
            if (fs.existsSync('data.json')) {
                const rawOld = fs.readFileSync('data.json');
                const jsonOld = JSON.parse(rawOld);
                const playersOld = Array.isArray(jsonOld) ? jsonOld : (jsonOld.players || []);
                playersOld.forEach(p => oldDataMap.set(p.riotId, p));
            }
        } catch (e) { console.log('   Nenhum cache válido encontrado.'); }

        // 2. LER CSV
        console.log('   Baixando planilha...');
        const response = await fetch(csvUrl);
        const csvText = await response.text();
        
        if (!csvText || csvText.length < 10) throw new Error('CSV inválido.');

        const records = parse(csvText, { columns: true, skip_empty_lines: true, trim: true });
        if (records.length === 0) throw new Error('CSV vazio.');

        const keys = Object.keys(records[0]);
        const roleKey = keys.find(k => k.toLowerCase().includes('fun'));
        const riotIdKey = keys.find(k => k.toLowerCase().includes('riot'));

        if (!roleKey || !riotIdKey) throw new Error('Colunas obrigatórias não encontradas.');

        let playersToFetch = [];
        let rosterMap = new Set(); 
        
        for (const record of records) {
            const role = record[roleKey];
            const riotId = record[riotIdKey];
            if (role && riotId && riotId.includes('#')) {
                playersToFetch.push({ role, riotId });
                // Normaliza o nome para comparação (remove espaços, tudo minúsculo)
                rosterMap.add(riotId.toLowerCase().replace(/\s/g, ''));
            }
        }

        let finalPlayersData = [];
        let allMatchesMap = new Map(); 
        const headers = { 'Authorization': henrikApiKey };

        // 3. LOOP DE BUSCA
        for (const [index, p] of playersToFetch.entries()) {
            console.log(`\n[${index + 1}/${playersToFetch.length}] 🔍 Analisando: ${p.riotId}`);
            
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
                // CHAMADA 1: Histórico AMPLIADO (15 partidas, QUALQUER MODO)
                // Removemos o filtro 'mode=competitive' para pegar Premier/Unrated
                let matchesRes = await smartFetch(`https://api.henrikdev.xyz/valorant/v3/matches/${region}/${safeName}/${safeTag}?size=15`, headers);
                
                if (matchesRes.status === 404) {
                     console.log('   ⚠️ Fallback de região (NA)...');
                     matchesRes = await smartFetch(`https://api.henrikdev.xyz/valorant/v3/matches/na/${safeName}/${safeTag}?size=15`, headers);
                }

                if (matchesRes.status === 200) {
                    const matchesData = await matchesRes.json();
                    
                    if (matchesData.data && matchesData.data.length > 0) {
                        // Filtra para encontrar a última partida "Real" para usar de referência de Rank
                        // Ignoramos Deathmatch para definir o Rank, mas guardamos para histórico geral
                        const validMatchForRank = matchesData.data.find(m => m.players && Array.isArray(m.players) && m.metadata.mode !== 'Deathmatch');
                        
                        if (validMatchForRank) {
                            const newMatchId = validMatchForRank.metadata.matchid;
                            
                            if (cachedPlayer && cachedPlayer.lastMatchId === newMatchId && cachedPlayer.currentRank !== 'Sem Rank') {
                                console.log(`   ⚡ Sem partidas 'reais' novas. Usando cache.`);
                                needsFullUpdate = false; 
                                playerData = { ...cachedPlayer, roleRaw: p.role };
                            } else {
                                console.log(`   🔄 Dados novos. Atualizando...`);
                                playerData.lastMatchId = newMatchId;
                                
                                const playerInMatch = validMatchForRank.players.find(pl => pl.name.toLowerCase() === name.trim().toLowerCase() && pl.tag.toLowerCase() === tag.trim().toLowerCase());
                                if (playerInMatch?.currenttier_patched) {
                                    playerData.currentRank = playerInMatch.currenttier_patched;
                                    if (playerInMatch.currenttier > 2) {
                                        playerData.currentRankIcon = `https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/${playerInMatch.currenttier}/smallicon.png`;
                                    }
                                }
                            }
                        }

                        // GUARDA AS PARTIDAS PARA A SINERGIA
                        // Aqui está o segredo: Guardamos TUDO que não for Deathmatch/Treino
                        matchesData.data.forEach(match => {
                            const mode = match.metadata.mode.toLowerCase();
                            const ignoredModes = ['deathmatch', 'onboarding', 'practice', 'snowball fight'];
                            
                            if (!ignoredModes.includes(mode) && match.players && Array.isArray(match.players)) {
                                if (!allMatchesMap.has(match.metadata.matchid)) {
                                    allMatchesMap.set(match.metadata.matchid, match);
                                }
                            }
                        });
                    }
                }

                if (needsFullUpdate) {
                    const accRes = await smartFetch(`https://api.henrikdev.xyz/valorant/v1/account/${safeName}/${safeTag}`, headers);
                    if (accRes.status === 200) {
                        const accData = await accRes.json();
                        playerData.level = accData.data.account_level;
                        playerData.card = accData.data.card.small;
                        
                        const apiRegion = accData.data.region;
                        region = ['na', 'eu', 'ap', 'kr', 'latam', 'br'].includes(apiRegion) ? apiRegion : 'br';
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
                if (cachedPlayer) {
                    playerData = cachedPlayer;
                    playerData.apiError = true; 
                } else {
                    playerData.apiError = true;
                }
            }

            finalPlayersData.push(playerData);
        }

        // 4. SINERGIA (COM DEBUG DETALHADO)
        console.log(`\n⚙️ Processando Sinergia em ${allMatchesMap.size} partidas candidatas...`);
        let operations = [];

        for (const [matchId, match] of allMatchesMap) {
            // Verifica quem estava na partida
            const squadMembers = match.players.filter(player => {
                const fullName = `${player.name}#${player.tag}`.toLowerCase().replace(/\s/g, '');
                const isMember = rosterMap.has(fullName);
                return isMember;
            });

            // LOG DE DIAGNÓSTICO: Mostra o que encontrou
            if (squadMembers.length > 0) {
                const names = squadMembers.map(m => m.name).join(', ');
                // Se encontrar 2 ou mais, é sucesso. Se for só 1, mostra que achou só 1.
                if (squadMembers.length >= 2) {
                    console.log(`   ✅ MATCH! ${match.metadata.map} (${match.metadata.mode}): ${names}`);
                } else {
                    // console.log(`   (Ignorado) Solo Q: ${names} em ${match.metadata.map}`);
                }
            }

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

        // Escrita Atômica
        fs.writeFileSync('data.temp.json', JSON.stringify(finalOutput, null, 2));
        fs.renameSync('data.temp.json', 'data.json');
        
        console.log(`✅ Sucesso! ${operations.length} Operações conjuntas encontradas.`);

    } catch (error) {
        console.error('🔥 Erro fatal:', error);
        process.exit(1);
    }
}

run();
