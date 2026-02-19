// update-data.js
const fs = require('fs');
const { parse } = require('csv-parse/sync');

const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSFrlbFvaPDuVahEtPUOJdt4EfIBzCJvHITDIR5cEDHcFCBTEofMe_-gG57bSh5KCuqD2dnzuaFn66p/pub?output=csv';
const henrikApiKey = process.env.HENRIK_API_KEY;

// --- CONFIGURAÇÃO ---
const REQUEST_DELAY = 8000; // 8s de intervalo para estabilidade total

const delay = ms => new Promise(res => setTimeout(res, ms));

async function smartFetch(url, headers, retries = 2) {
    const start = Date.now();
    let response = null;
    let error = null;

    try {
        response = await fetch(url, { headers });
        if (response.status === 429 && retries > 0) {
            console.log(`      ⛔ Rate Limit (429). Pausa de 45s...`);
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
        console.log('--- PROTOCOLO V: SYNC SYSTEM ONLINE ---');
        
        let oldDataMap = new Map();
        try {
            if (fs.existsSync('data.json')) {
                const jsonOld = JSON.parse(fs.readFileSync('data.json'));
                (Array.isArray(jsonOld) ? jsonOld : (jsonOld.players || [])).forEach(p => oldDataMap.set(p.riotId, p));
            }
        } catch (e) { }

        console.log('1. A processar lista de agentes...');
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

        console.log(`2. A sincronizar dados de ${playersToFetch.length} agentes...`);

        for (const [index, p] of playersToFetch.entries()) {
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
                // ETAPA 1: Lista de partidas (v3)
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

                            // Verifica Cache de Equipa
                            if (allMatchesMap.has(matchId)) {
                                bestMatch = allMatchesMap.get(matchId);
                                break;
                            }

                            // ETAPA 2: Detalhes da partida (v2 - Mais estável)
                            const detailRes = await smartFetch(`https://api.henrikdev.xyz/valorant/v2/match/${matchId}`, headers);
                            
                            if (detailRes.status === 200) {
                                const detailData = await detailRes.json();
                                bestMatch = detailData.data;

                                // Compatibilidade v2 -> v3 structure
                                if (bestMatch.players && !Array.isArray(bestMatch.players) && bestMatch.players.all_players) {
                                    bestMatch.players = bestMatch.players.all_players;
                                }

                                allMatchesMap.set(matchId, bestMatch);
                                break;
                            }
                        }

                        if (bestMatch) {
                            const playerInMatch = bestMatch.players.find(pl => pl.name.toLowerCase() === name.trim().toLowerCase() && pl.tag.toLowerCase() === tag.trim().toLowerCase());
                            
                            if (cachedPlayer && cachedPlayer.lastMatchId === bestMatch.metadata.matchid && cachedPlayer.currentRank !== 'Sem Rank') {
                                needsFullUpdate = false;
                                playerData = { ...cachedPlayer, roleRaw: p.role, lastMatchId: bestMatch.metadata.matchid };
                            } else {
                                playerData.lastMatchId = bestMatch.metadata.matchid;
                                if (playerInMatch?.currenttier_patched) {
                                    playerData.currentRank = playerInMatch.currenttier_patched;
                                    if (playerInMatch.currenttier > 2) {
                                        playerData.currentRankIcon = `https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/${playerInMatch.currenttier}/smallicon.png`;
                                    }
                                }
                            }
                        }
                    }
                } else {
                    console.log(`   [${p.riotId}] Erro API Lista: ${listRes.status}`);
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
                console.error(`   [${p.riotId}] Falha: ${err.message}`);
                if (cachedPlayer) playerData = cachedPlayer;
                else playerData.apiError = true;
            }

            finalPlayersData.push(playerData);
            if ((index + 1) % 5 === 0) console.log(`   ... ${index + 1}/${playersToFetch.length} processados.`);
        }

        console.log(`3. A calcular sinergia (${allMatchesMap.size} partidas únicas)...`);
        let operations = [];

        for (const [matchId, match] of allMatchesMap) {
            if (!match.players || !Array.isArray(match.players)) continue;

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
                    started_at: match.metadata.game_start * 1000, 
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

        // --- NOVO SISTEMA DE HISTÓRICO POR DATA ---
        
        // 1. Garantir que a pasta history existe
        const historyDir = './history';
        if (!fs.existsSync(historyDir)) {
            fs.mkdirSync(historyDir);
        }

        // 2. Agrupar as novas operações lidas da API pela data (YYYY-MM-DD)
        const newOpsByDate = {};
        for (const op of operations) {
            const dateObj = new Date(op.started_at);
            const dateStr = dateObj.toISOString().split('T')[0];
            
            if (!newOpsByDate[dateStr]) newOpsByDate[dateStr] = [];
            newOpsByDate[dateStr].push(op);
        }

        // 3. Mesclar as novas operações com os arquivos de histórico existentes (Deduplicação)
        for (const [dateStr, ops] of Object.entries(newOpsByDate)) {
            const filePath = `${historyDir}/${dateStr}.json`;
            let dailyOps = [];
            
            if (fs.existsSync(filePath)) {
                dailyOps = JSON.parse(fs.readFileSync(filePath));
            }
            
            const existingIds = new Set(dailyOps.map(o => o.id));
            let addedNew = false;
            
            for (const op of ops) {
                if (!existingIds.has(op.id)) {
                    dailyOps.push(op);
                    addedNew = true;
                }
            }
            
            // Se adicionou algo novo, ordena por data decrescente e salva o arquivo do dia
            if (addedNew) {
                dailyOps.sort((a, b) => b.started_at - a.started_at);
                fs.writeFileSync(filePath, JSON.stringify(dailyOps, null, 2));
            }
        }

        // 4. Ler todos os dias disponíveis na pasta history
        let availableDates = [];
        if (fs.existsSync(historyDir)) {
            availableDates = fs.readdirSync(historyDir)
                .filter(f => f.endsWith('.json'))
                .map(f => f.replace('.json', ''))
                .sort((a, b) => b.localeCompare(a)); // Ordena do mais recente para o mais antigo
        }

        // 5. Pegar apenas as 4 partidas mais recentes de todos os tempos para a página inicial
        let recentOperations = [];
        for (const dateStr of availableDates) {
            const dailyOps = JSON.parse(fs.readFileSync(`${historyDir}/${dateStr}.json`));
            recentOperations.push(...dailyOps);
            if (recentOperations.length >= 4) break;
        }
        recentOperations = recentOperations.slice(0, 4);

        // 6. Gerar o data.json final
        const finalOutput = { 
            updatedAt: Date.now(), 
            players: finalPlayersData, 
            operations: recentOperations,
            availableDates: availableDates // Enviado para o script do Frontend criar os botões
        };
        
        fs.writeFileSync('data.temp.json', JSON.stringify(finalOutput, null, 2));
        fs.renameSync('data.temp.json', 'data.json');
        
        console.log(`✅ SUCESSO! ${finalPlayersData.length} Agentes | Histórico atualizado em cache diário.`);

    } catch (error) {
        console.error('🔥 Erro fatal:', error);
        process.exit(1);
    }
}

run();
