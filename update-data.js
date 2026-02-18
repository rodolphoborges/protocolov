// update-data.js
const fs = require('fs');
const { parse } = require('csv-parse/sync');

const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSFrlbFvaPDuVahEtPUOJdt4EfIBzCJvHITDIR5cEDHcFCBTEofMe_-gG57bSh5KCuqD2dnzuaFn66p/pub?output=csv';
const henrikApiKey = process.env.HENRIK_API_KEY;
const debugTarget = process.env.DEBUG_TARGET || '';

// --- CONFIGURAÇÃO DE SEGURANÇA ---
// Limite da API: 30 req/min (1 a cada 2s).
// Configuração: 1 req a cada 3.5s = ~17 req/min. (Margem de segurança de 40%)
const REQUEST_DELAY = 3500; 

const delay = ms => new Promise(res => setTimeout(res, ms));

/**
 * Função Wrapper para chamadas à API.
 * Garante que SEMPRE haverá um delay após a chamada, impedindo o estouro do limite.
 */
async function smartFetch(url, headers) {
    const start = Date.now();
    let response = null;
    let error = null;

    try {
        response = await fetch(url, { headers });
    } catch (e) {
        error = e;
    }

    // Calcula quanto tempo passou e força o delay restante
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
        console.log('--- PROTOCOLO V: SAFE MODE (ANTI-RATE LIMIT) ---');
        console.log(`   Configuração: 1 chamada a cada ${REQUEST_DELAY}ms`);
        
        // 1. CARREGAR CACHE
        let oldDataMap = new Map();
        try {
            if (fs.existsSync('data.json')) {
                const rawOld = fs.readFileSync('data.json');
                const jsonOld = JSON.parse(rawOld);
                const playersOld = Array.isArray(jsonOld) ? jsonOld : (jsonOld.players || []);
                playersOld.forEach(p => oldDataMap.set(p.riotId, p));
                console.log(`   Cache carregado: ${playersOld.length} registros.`);
            }
        } catch (e) { console.log('   Nenhum cache válido encontrado.'); }

        // 2. LER CSV
        console.log('   Baixando planilha...');
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

        // 3. LOOP SEGURO
        for (const [index, p] of playersToFetch.entries()) {
            // Log de progresso claro
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
                // CHAMADA 1: Histórico (Consome 1 crédito de tempo)
                let matchesRes = await smartFetch(`https://api.henrikdev.xyz/valorant/v3/matches/${region}/${safeName}/${safeTag}?mode=competitive&size=5`, headers);
                
                // Fallback de região se 404 (Consome +1 crédito de tempo se falhar)
                if (matchesRes.status === 404) {
                     console.log('   ⚠️ Região BR não encontrada, tentando fallback...');
                     matchesRes = await smartFetch(`https://api.henrikdev.xyz/valorant/v3/matches/na/${safeName}/${safeTag}?mode=competitive&size=5`, headers);
                }

                if (matchesRes.status === 200) {
                    const matchesData = await matchesRes.json();
                    if (matchesData.data && matchesData.data.length > 0) {
                        const validMatch = matchesData.data.find(m => m.players && Array.isArray(m.players));
                        
                        if (validMatch) {
                            const newMatchId = validMatch.metadata.matchid;
                            
                            // VERIFICAÇÃO DE CACHE
                            if (cachedPlayer && cachedPlayer.lastMatchId === newMatchId && cachedPlayer.currentRank !== 'Sem Rank') {
                                console.log(`   ⚡ Sem partidas novas. Usando dados salvos.`);
                                needsFullUpdate = false; 
                                playerData = { ...cachedPlayer, roleRaw: p.role };
                            } else {
                                console.log(`   🔄 Dados desatualizados. Buscando info completa...`);
                                playerData.lastMatchId = newMatchId;
                                
                                // Tenta pegar rank da partida para economizar
                                const playerInMatch = validMatch.players.find(pl => pl.name.toLowerCase() === name.trim().toLowerCase() && pl.tag.toLowerCase() === tag.trim().toLowerCase());
                                if (playerInMatch?.currenttier_patched) {
                                    playerData.currentRank = playerInMatch.currenttier_patched;
                                    if (playerInMatch.currenttier > 2) {
                                        playerData.currentRankIcon = `https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/${playerInMatch.currenttier}/smallicon.png`;
                                    }
                                }
                            }

                            // Salva partidas para sinergia
                            matchesData.data.forEach(match => {
                                if (match.players && Array.isArray(match.players) && !allMatchesMap.has(match.metadata.matchid)) {
                                    allMatchesMap.set(match.metadata.matchid, match);
                                }
                            });
                        }
                    }
                }

                // SÓ FAZ ESSAS CHAMADAS SE REALMENTE PRECISAR
                if (needsFullUpdate) {
                    // CHAMADA 2: Conta (Consome +1 crédito de tempo)
                    const accRes = await smartFetch(`https://api.henrikdev.xyz/valorant/v1/account/${safeName}/${safeTag}`, headers);
                    if (accRes.status === 200) {
                        const accData = await accRes.json();
                        playerData.level = accData.data.account_level;
                        playerData.card = accData.data.card.small;
                        // Ajusta região para a próxima chamada
                        region = (accData.data.region === 'na' || accData.data.region === 'latam') ? 'br' : accData.data.region;
                    }

                    // CHAMADA 3: MMR (Consome +1 crédito de tempo)
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
                // Em caso de erro, tenta usar o que tem no cache para não quebrar o site
                if (cachedPlayer) playerData = cachedPlayer;
                else playerData.apiError = true;
            }

            finalPlayersData.push(playerData);
        }

        // 4. SINERGIA
        console.log(`\n⚙️ Processando Sinergia (${allMatchesMap.size} partidas)...`);
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
        console.log(`✅ Sucesso! Dados salvos.`);

    } catch (error) {
        console.error('🔥 Erro fatal:', error);
        process.exit(1);
    }
}

run();
