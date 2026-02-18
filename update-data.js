// update-data.js
const fs = require('fs');
const { parse } = require('csv-parse/sync');

const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSFrlbFvaPDuVahEtPUOJdt4EfIBzCJvHITDIR5cEDHcFCBTEofMe_-gG57bSh5KCuqD2dnzuaFn66p/pub?output=csv';
const henrikApiKey = process.env.HENRIK_API_KEY;
const debugTarget = process.env.DEBUG_TARGET || 'ousadia';

// --- CONFIGURAÇÃO DE SEGURANÇA ---
// 6 segundos de intervalo = 10 requisições/minuto (Seguro contra 429)
const REQUEST_DELAY = 6000; 

const delay = ms => new Promise(res => setTimeout(res, ms));

// Função de Fetch Inteligente com Retry Automático
async function smartFetch(url, headers, retries = 2) {
    const start = Date.now();
    let response = null;
    let error = null;

    try {
        response = await fetch(url, { headers });
        
        // Se der Rate Limit (429), espera 30s e tenta de novo
        if (response.status === 429 && retries > 0) {
            console.log(`      ⛔ Rate Limit (429). Pausa tática de 30s...`);
            await delay(30000); 
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
        console.log('--- PROTOCOLO V: SURGICAL MODE (LIST + DETAILS) ---');
        
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
                // ETAPA 1: Buscar LISTA de partidas (apenas para pegar o ID)
                // Usamos size=10 para garantir que encontramos a última competitiva
                let listRes = await smartFetch(`https://api.henrikdev.xyz/valorant/v3/matches/${region}/${safeName}/${safeTag}?size=10`, headers);
                
                if (listRes.status === 404) {
                     console.log('   ⚠️ Região BR não encontrada. Tentando NA...');
                     listRes = await smartFetch(`https://api.henrikdev.xyz/valorant/v3/matches/na/${safeName}/${safeTag}?size=10`, headers);
                }

                if (listRes.status === 200) {
                    const listData = await listRes.json();
                    
                    // Encontra o ID da última partida COMPETITIVE (mesmo que venha sem jogadores)
                    const lastCompMatch = listData.data ? listData.data.find(m => m.metadata.mode.toLowerCase() === 'competitive') : null;

                    if (lastCompMatch) {
                        const matchId = lastCompMatch.metadata.matchid;
                        
                        // Verifica se já temos essa partida salva
                        if (cachedPlayer && cachedPlayer.lastMatchId === matchId && cachedPlayer.currentRank !== 'Sem Rank') {
                            console.log(`   ⚡ ID ${matchId} já processado. Usando Cache.`);
                            needsFullUpdate = false;
                            playerData = { ...cachedPlayer, roleRaw: p.role };
                        } else {
                            console.log(`   📥 Novo ID detetado: ${matchId}. Buscando detalhes completos...`);
                            playerData.lastMatchId = matchId;

                            // ETAPA 2: Buscar DETALHES da partida (Obrigatório para ter os jogadores)
                            const detailRes = await smartFetch(`https://api.henrikdev.xyz/valorant/v3/match/${matchId}`, headers);
                            
                            if (detailRes.status === 200) {
                                const detailData = await detailRes.json();
                                const fullMatch = detailData.data;

                                // Atualiza Rank usando a partida completa
                                const playerInMatch = fullMatch.players.find(pl => pl.name.toLowerCase() === name.trim().toLowerCase() && pl.tag.toLowerCase() === tag.trim().toLowerCase());
                                if (playerInMatch?.currenttier_patched) {
                                    playerData.currentRank = playerInMatch.currenttier_patched;
                                    if (playerInMatch.currenttier > 2) {
                                        playerData.currentRankIcon = `https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/${playerInMatch.currenttier}/smallicon.png`;
                                    }
                                }

                                // Guarda para Sinergia
                                if (!allMatchesMap.has(matchId)) {
                                    allMatchesMap.set(matchId, fullMatch);
                                }
                            }
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
        console.log(`\n⚙️ Processando Sinergia (${allMatchesMap.size} partidas)...`);
        let operations = [];

        for (const [matchId, match] of allMatchesMap) {
            // Garante que temos jogadores na lista
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
