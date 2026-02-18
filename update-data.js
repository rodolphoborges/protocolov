// update-data.js
const fs = require('fs');

const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSFrlbFvaPDuVahEtPUOJdt4EfIBzCJvHITDIR5cEDHcFCBTEofMe_-gG57bSh5KCuqD2dnzuaFn66p/pub?output=csv';
const henrikApiKey = process.env.HENRIK_API_KEY;

// Delay ultra seguro para API Gratuita
const delay = ms => new Promise(res => setTimeout(res, ms));

async function run() {
    try {
        console.log('--- INICIANDO PROTOCOLO V: DATA UPDATE (TANK MODE) ---');
        
        // 1. LER O CSV E MAPEAR MEMBROS
        console.log('Lendo planilha de recrutamento...');
        const response = await fetch(csvUrl);
        const csvData = await response.text();
        const rows = csvData.split('\n');
        
        let playersToFetch = [];
        let rosterMap = new Set(); 
        let debugNames = []; // Para logar quem o sistema reconheceu
        
        if (rows.length > 1) {
            const headers = rows[0].split(',');
            let roleCol = -1, riotIdCol = -1;
            
            headers.forEach((h, i) => {
                if (h.toLowerCase().includes('fun')) roleCol = i;
                if (h.toLowerCase().includes('riot')) riotIdCol = i;
            });

            for (let i = 1; i < rows.length; i++) {
                const cols = rows[i].split(',');
                if (cols.length < 2) continue;
                
                let role = cols[roleCol] ? cols[roleCol].replace(/"/g, '').trim() : '';
                let riotId = cols[riotIdCol] ? cols[riotIdCol].replace(/"/g, '').trim() : '';
                
                if (role && riotId && riotId.includes('#')) {
                    playersToFetch.push({ role, riotId });
                    // Normaliza o nome para comparação (tudo minúsculo, sem espaços)
                    const cleanName = riotId.toLowerCase().replace(/\s/g, '');
                    rosterMap.add(cleanName);
                    debugNames.push(`${riotId} -> ${cleanName}`);
                }
            }
        }
        
        console.log(`Membros identificados na planilha: ${rosterMap.size}`);

        let finalPlayersData = [];
        let allMatchesMap = new Map(); 
        const headers = { 'Authorization': henrikApiKey };

        // 2. BUSCAR DADOS (Loop Lento)
        for (const [index, p] of playersToFetch.entries()) {
            console.log(`\n[${index + 1}/${playersToFetch.length}] Processando Agente: ${p.riotId}`);
            const [name, tag] = p.riotId.split('#');
            
            let playerData = {
                riotId: p.riotId,
                roleRaw: p.role,
                trackerLink: `https://tracker.gg/valorant/profile/riot/${encodeURIComponent(name.trim())}%23${encodeURIComponent(tag.trim())}/overview`,
                level: '--',
                card: 'https://media.valorant-api.com/playercards/9fb348bc-41a0-91ad-8a3e-818035c4e561/smallart.png',
                currentRank: 'Sem Rank',
                peakRank: 'Sem Rank',
                currentRankIcon: '',
                peakRankIcon: '',
                apiError: false
            };

            let region = 'br';

            try {
                // A. Conta (Delay inicial)
                await delay(1000); 
                const accRes = await fetch(`https://api.henrikdev.xyz/valorant/v1/account/${encodeURIComponent(name.trim())}/${encodeURIComponent(tag.trim())}`, { headers });
                
                if (accRes.status === 200) {
                    const accData = await accRes.json();
                    playerData.level = accData.data.account_level;
                    playerData.card = accData.data.card.small;
                    region = accData.data.region;
                } else {
                    console.warn(`⚠️ Erro Conta (${accRes.status}): ${p.riotId}`);
                }

                // B. MMR (Delay intermediário)
                await delay(1000);
                const mmrRes = await fetch(`https://api.henrikdev.xyz/valorant/v2/mmr/${region}/${encodeURIComponent(name.trim())}/${encodeURIComponent(tag.trim())}`, { headers });
                
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

                // C. HISTÓRICO EXPANDIDO (Últimas 10 partidas)
                // Aumentamos para 10 para "pescar" a partida de ontem caso tenhas jogado muito hoje
                console.log(`Buscando últimas 10 missões...`);
                await delay(2000); 
                
                const matchesRes = await fetch(`https://api.henrikdev.xyz/valorant/v3/matches/${region}/${encodeURIComponent(name.trim())}/${encodeURIComponent(tag.trim())}?mode=competitive&size=10`, { headers });
                
                if (matchesRes.status === 200) {
                    const matchesData = await matchesRes.json();
                    if (matchesData.data && matchesData.data.length > 0) {
                        // Fallback de Rank
                        if (playerData.currentRank === 'Sem Rank' || playerData.currentRank === 'Unranked') {
                            const lastMatch = matchesData.data[0];
                            if (lastMatch.players && Array.isArray(lastMatch.players)) {
                                const playerInMatch = lastMatch.players.find(pl => pl.name.toLowerCase() === name.trim().toLowerCase() && pl.tag.toLowerCase() === tag.trim().toLowerCase());
                                if (playerInMatch?.currenttier_patched) {
                                    playerData.currentRank = playerInMatch.currenttier_patched;
                                    console.log(`>>> Rank recuperado via histórico: ${playerData.currentRank}`);
                                    if (playerInMatch.currenttier > 2) {
                                        playerData.currentRankIcon = `https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/${playerInMatch.currenttier}/smallicon.png`;
                                    }
                                }
                            }
                        }

                        // Armazena partidas
                        matchesData.data.forEach(match => {
                            if (!allMatchesMap.has(match.metadata.matchid)) {
                                allMatchesMap.set(match.metadata.matchid, match);
                            }
                        });
                    }
                } else {
                    console.warn(`⚠️ Erro Partidas (${matchesRes.status}): ${p.riotId}`);
                }

            } catch (err) {
                console.error(`Erro ao processar ${p.riotId}`, err);
                playerData.apiError = true;
            }

            finalPlayersData.push(playerData);
            
            // DELAY CRÍTICO: 15 Segundos entre jogadores
            // Isso garante que nunca ultrapassamos o limite da API Gratuita
            console.log(`...Respirando por 15s para evitar bloqueio...`);
            await delay(15000); 
        }

        // 3. PROCESSAR SINERGIA (OPERAÇÕES)
        console.log(`\n--------------------------------`);
        console.log(`Cruzando dados de ${allMatchesMap.size} partidas encontradas...`);
        
        let operations = [];

        for (const [matchId, match] of allMatchesMap) {
            // Proteção contra dados corrompidos
            if (!match.players || !Array.isArray(match.players)) continue;

            // Filtra e Debuga quem estava na partida
            const squadMembers = match.players.filter(player => {
                const fullName = `${player.name}#${player.tag}`.toLowerCase().replace(/\s/g, '');
                const isMember = rosterMap.has(fullName);
                return isMember;
            });

            // Se encontrou 2 ou mais, é uma Operação
            if (squadMembers.length >= 2) {
                // Log especial para debugarmos se ele encontrou a partida certa
                const namesFound = squadMembers.map(m => `${m.name}#${m.tag}`).join(', ');
                console.log(`>> OPERAÇÃO ENCONTRADA (${match.metadata.map}): ${namesFound}`);

                const teamId = squadMembers[0].team; 
                const teamData = match.teams ? match.teams[teamId.toLowerCase()] : null;
                const hasWon = teamData ? teamData.has_won : false;
                const scoreStr = match.teams ? `${match.teams.blue.rounds_won}-${match.teams.red.rounds_won}` : 'N/A';
                
                operations.push({
                    id: matchId,
                    map: match.metadata.map,
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
        console.log(`\nSucesso Final! ${finalPlayersData.length} Jogadores e ${operations.length} Operações registradas.`);

    } catch (error) {
        console.error('Erro fatal:', error);
        process.exit(1);
    }
}

run();
