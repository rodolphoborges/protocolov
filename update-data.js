// update-data.js
const fs = require('fs');

const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSFrlbFvaPDuVahEtPUOJdt4EfIBzCJvHITDIR5cEDHcFCBTEofMe_-gG57bSh5KCuqD2dnzuaFn66p/pub?output=csv';
const henrikApiKey = process.env.HENRIK_API_KEY;

const delay = ms => new Promise(res => setTimeout(res, ms));

async function run() {
    try {
        console.log('--- INICIANDO PROTOCOLO V: DATA UPDATE ---');
        
        // 1. LER O CSV E MAPEAR MEMBROS
        console.log('Lendo planilha de recrutamento...');
        const response = await fetch(csvUrl);
        const csvData = await response.text();
        const rows = csvData.split('\n');
        
        let playersToFetch = [];
        let rosterMap = new Set(); 
        
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
                    rosterMap.add(riotId.toLowerCase().replace(/\s/g, ''));
                }
            }
        }

        let finalPlayersData = [];
        let allMatchesMap = new Map(); 
        const headers = { 'Authorization': henrikApiKey };

        // 2. BUSCAR DADOS INDIVIDUAIS E HISTÓRICO
        for (const p of playersToFetch) {
            console.log(`--------------------------------`);
            console.log(`Processando Agente: ${p.riotId}`);
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
                // A. Conta
                await delay(200); 
                const accRes = await fetch(`https://api.henrikdev.xyz/valorant/v1/account/${encodeURIComponent(name.trim())}/${encodeURIComponent(tag.trim())}`, { headers });
                const accData = await accRes.json();

                if (accData.status === 200) {
                    playerData.level = accData.data.account_level;
                    playerData.card = accData.data.card.small;
                    region = accData.data.region;
                }

                // B. MMR
                await delay(200);
                const mmrRes = await fetch(`https://api.henrikdev.xyz/valorant/v2/mmr/${region}/${encodeURIComponent(name.trim())}/${encodeURIComponent(tag.trim())}`, { headers });
                const mmrData = await mmrRes.json();

                if (mmrData.status === 200) {
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

                // C. HISTÓRICO
                console.log(`Buscando registro de missões...`);
                await delay(500); 
                
                const matchesRes = await fetch(`https://api.henrikdev.xyz/valorant/v3/matches/${region}/${encodeURIComponent(name.trim())}/${encodeURIComponent(tag.trim())}?mode=competitive&size=5`, { headers });
                const matchesData = await matchesRes.json();

                if (matchesData.status === 200 && matchesData.data.length > 0) {
                    // Fallback de Rank
                    if (playerData.currentRank === 'Sem Rank' || playerData.currentRank === 'Unranked') {
                        const lastMatch = matchesData.data[0];
                        // Verifica se players existe antes de tentar o find (Proteção Extra aqui também)
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

            } catch (err) {
                console.error(`Erro ao processar ${p.riotId}`, err);
                playerData.apiError = true;
            }

            finalPlayersData.push(playerData);
            
            console.log(`Cooldown tático...`);
            await delay(2500); 
        }

        // 3. PROCESSAR SINERGIA (OPERAÇÕES)
        console.log(`--------------------------------`);
        console.log(`Analisando Sinergia em ${allMatchesMap.size} partidas únicas...`);
        
        let operations = [];

        for (const [matchId, match] of allMatchesMap) {
            // --- CORREÇÃO DO ERRO ---
            // Verifica se a partida tem estrutura válida antes de tentar filtrar
            if (!match.players || !Array.isArray(match.players)) {
                console.warn(`⚠️ Partida ${matchId} ignorada: Dados de jogadores incompletos.`);
                continue; // Pula para a próxima partida sem quebrar o script
            }
            // ------------------------

            // Filtra quem estava nessa partida que TAMBÉM faz parte do Protocolo V
            const squadMembers = match.players.filter(player => {
                const fullName = `${player.name}#${player.tag}`.toLowerCase().replace(/\s/g, '');
                return rosterMap.has(fullName);
            });

            if (squadMembers.length >= 2) {
                const teamId = squadMembers[0].team; 
                const teamData = match.teams ? match.teams[teamId.toLowerCase()] : null;
                
                // Mais segurança caso dados de time falhem
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

        // 4. SALVAR
        const finalOutput = {
            updatedAt: Date.now(),
            players: finalPlayersData,
            operations: operations
        };

        fs.writeFileSync('data.json', JSON.stringify(finalOutput, null, 2));
        console.log(`Sucesso! ${finalPlayersData.length} Agentes e ${operations.length} Operações registradas.`);

    } catch (error) {
        console.error('Erro fatal:', error);
        process.exit(1);
    }
}

run();
