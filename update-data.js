// update-data.js
const fs = require('fs');

const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSFrlbFvaPDuVahEtPUOJdt4EfIBzCJvHITDIR5cEDHcFCBTEofMe_-gG57bSh5KCuqD2dnzuaFn66p/pub?output=csv';
const henrikApiKey = process.env.HENRIK_API_KEY;

// Delay de segurança
const delay = ms => new Promise(res => setTimeout(res, ms));

async function run() {
    try {
        console.log('--- PROTOCOLO V: COMPETITIVE TRACKER (DIAGNOSTIC MODE) ---');
        
        // 1. LER E MAPEAR MEMBROS DO SHEET
        console.log('1. Carregando lista de Agentes...');
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
                    
                    // NORMALIZAÇÃO DE NOME: Tudo minúsculo, sem espaços
                    const cleanName = riotId.toLowerCase().replace(/\s/g, '');
                    rosterMap.add(cleanName);
                    
                    // Log para conferirmos como o sistema vê os nomes
                    // console.log(`   > Cadastro reconhecido: ${cleanName}`);
                }
            }
        }
        console.log(`Total de Agentes cadastrados: ${rosterMap.size}`);

        let finalPlayersData = [];
        let allMatchesMap = new Map(); 
        const headers = { 'Authorization': henrikApiKey };

        // 2. BUSCAR DADOS (LOOP PRINCIPAL)
        for (const [index, p] of playersToFetch.entries()) {
            console.log(`\n[${index + 1}/${playersToFetch.length}] Analisando Agente: ${p.riotId}`);
            const [name, tag] = p.riotId.split('#');
            const safeName = encodeURIComponent(name.trim());
            const safeTag = encodeURIComponent(tag.trim());
            const cleanID = p.riotId.toLowerCase().replace(/\s/g, '');

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

            let region = 'br';

            try {
                // A. CONTA
                await delay(1000); 
                const accRes = await fetch(`https://api.henrikdev.xyz/valorant/v1/account/${safeName}/${safeTag}`, { headers });
                
                if (accRes.status === 200) {
                    const accData = await accRes.json();
                    playerData.level = accData.data.account_level;
                    playerData.card = accData.data.card.small;
                    region = accData.data.region;
                    
                    // Correção forçada: Se a conta for antiga (NA/LATAM) mas joga no BR, forçamos a busca de partidas no BR
                    // Isso resolve 90% dos casos de "Partida não encontrada"
                    if (region === 'na' || region === 'latam') {
                        console.log(`   ! Aviso: Conta marcada como '${region}'. Assumindo partidas no servidor 'br'.`);
                        region = 'br';
                    }
                }

                // B. MMR
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
                        const peakTier = mmrData.data.highest_rank.tier;
                        if (peakTier > 2) {
                            playerData.peakRankIcon = `https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/${peakTier}/smallicon.png`;
                        }
                    }
                }

                // C. HISTÓRICO DE PARTIDAS (Filtro Competitivo ATIVADO)
                // Aumentamos para 10 para ter margem de segurança
                console.log(`   > Buscando últimas 10 partidas competitivas...`);
                await delay(1500); 
                
                const matchesRes = await fetch(`https://api.henrikdev.xyz/valorant/v3/matches/${region}/${safeName}/${safeTag}?mode=competitive&size=10`, { headers });
                
                if (matchesRes.status === 200) {
                    const matchesData = await matchesRes.json();
                    
                    if (matchesData.data && matchesData.data.length > 0) {
                        
                        // --- BLOCO DE DIAGNÓSTICO DO DETETIVE (SÓ PARA OUSADIA) ---
                        // Se for você, vamos imprimir a última partida inteira para ver quem estava lá
                        if (cleanID.includes('ousadia')) {
                            const lastMatch = matchesData.data[0];
                            console.log(`\n   🔍 [RAIO-X] Analisando última partida de Ousadia (Mapa: ${lastMatch.metadata.map}):`);
                            console.log(`   Jogadores encontrados na API:`);
                            lastMatch.players.forEach(pl => {
                                const pName = `${pl.name}#${pl.tag}`.toLowerCase().replace(/\s/g, '');
                                const isMember = rosterMap.has(pName);
                                const status = isMember ? "✅ MEMBRO" : "❌ desconhecido";
                                console.log(`      - ${pl.name}#${pl.tag} [ID Limpo: ${pName}] -> ${status}`);
                            });
                            console.log(`   --- Fim da Análise ---\n`);
                        }
                        // -----------------------------------------------------------

                        // Fallback de Rank
                        if (playerData.currentRank === 'Sem Rank' || playerData.currentRank === 'Unranked') {
                            const lastMatch = matchesData.data[0];
                            const playerInMatch = lastMatch.players.find(pl => pl.name.toLowerCase() === name.trim().toLowerCase() && pl.tag.toLowerCase() === tag.trim().toLowerCase());
                            if (playerInMatch?.currenttier_patched) {
                                playerData.currentRank = playerInMatch.currenttier_patched;
                                console.log(`   >>> Rank recuperado via Partida: ${playerData.currentRank}`);
                                if (playerInMatch.currenttier > 2) {
                                    playerData.currentRankIcon = `https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/${playerInMatch.currenttier}/smallicon.png`;
                                }
                            }
                        }

                        // Armazena partidas
                        matchesData.data.forEach(match => {
                            if (!allMatchesMap.has(match.metadata.matchid)) {
                                allMatchesMap.set(match.metadata.matchid, match);
                            }
                        });
                    } else {
                        console.log(`   > Nenhuma partida competitiva encontrada recentemente.`);
                    }
                }

            } catch (err) {
                console.error(`   !!! Erro ao processar ${p.riotId}`, err.message);
                playerData.apiError = true;
            }

            finalPlayersData.push(playerData);
            
            // DELAY ANTI-BLOQUEIO (12 segundos)
            console.log(`   ...Aguardando 12s...`);
            await delay(12000); 
        }

        // 3. CRUZAMENTO DE DADOS (SINERGIA)
        console.log(`\n--------------------------------`);
        console.log(`3. Cruzando dados de ${allMatchesMap.size} partidas únicas...`);
        
        let operations = [];

        for (const [matchId, match] of allMatchesMap) {
            if (!match.players || !Array.isArray(match.players)) continue;

            const squadMembers = match.players.filter(player => {
                const fullName = `${player.name}#${player.tag}`.toLowerCase().replace(/\s/g, '');
                return rosterMap.has(fullName);
            });

            if (squadMembers.length >= 2) {
                // Log de Sucesso
                const namesFound = squadMembers.map(m => `${m.name}#${m.tag}`).join(', ');
                console.log(`   ★ OPERAÇÃO CONFIRMADA (${match.metadata.map}): ${namesFound}`);

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
        console.log(`\n=== RELATÓRIO FINAL ===`);
        console.log(`Jogadores Processados: ${finalPlayersData.length}`);
        console.log(`Operações Encontradas: ${operations.length}`);
        console.log(`Processo Concluído.`);

    } catch (error) {
        console.error('Erro fatal:', error);
        process.exit(1);
    }
}

run();
