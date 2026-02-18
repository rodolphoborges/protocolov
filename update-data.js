// update-data.js
const fs = require('fs');

const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSFrlbFvaPDuVahEtPUOJdt4EfIBzCJvHITDIR5cEDHcFCBTEofMe_-gG57bSh5KCuqD2dnzuaFn66p/pub?output=csv';
const henrikApiKey = process.env.HENRIK_API_KEY;

const delay = ms => new Promise(res => setTimeout(res, ms));

async function run() {
    try {
        console.log('Lendo planilha...');
        const response = await fetch(csvUrl);
        const csvData = await response.text();
        const rows = csvData.split('\n');
        
        let playersToFetch = [];
        
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
                }
            }
        }

        let finalData = [];
        const headers = { 'Authorization': henrikApiKey };

        for (const p of playersToFetch) {
            console.log(`--------------------------------`);
            console.log(`Processando: ${p.riotId}`);
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

            try {
                // 1. Descobre a Região da Conta
                // Aumentei o delay inicial para garantir fôlego
                await delay(200); 
                const accRes = await fetch(`https://api.henrikdev.xyz/valorant/v1/account/${encodeURIComponent(name.trim())}/${encodeURIComponent(tag.trim())}`, { headers });
                const accData = await accRes.json();

                let region = 'br'; 

                if (accData.status === 200) {
                    playerData.level = accData.data.account_level;
                    playerData.card = accData.data.card.small;
                    region = accData.data.region;
                } else {
                    console.warn(`⚠️ Falha na Conta (${accData.status}): ${p.riotId}`);
                }

                // 2. Tenta buscar MMR Oficial
                await delay(200);
                const mmrRes = await fetch(`https://api.henrikdev.xyz/valorant/v2/mmr/${region}/${encodeURIComponent(name.trim())}/${encodeURIComponent(tag.trim())}`, { headers });
                const mmrData = await mmrRes.json();

                if (mmrData.status === 200) {
                    if (mmrData.data.current_data && mmrData.data.current_data.currenttierpatched) {
                        playerData.currentRank = mmrData.data.current_data.currenttierpatched;
                        playerData.currentRankIcon = mmrData.data.current_data.images.small;
                    }
                    if (mmrData.data.highest_rank && mmrData.data.highest_rank.patched_tier) {
                        playerData.peakRank = mmrData.data.highest_rank.patched_tier;
                        const peakTier = mmrData.data.highest_rank.tier;
                        if (peakTier > 2) {
                            playerData.peakRankIcon = `https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/${peakTier}/smallicon.png`;
                        }
                    }
                }

                // 3. FALLBACK: Busca última partida COMPETITIVA
                if (playerData.currentRank === 'Sem Rank' || playerData.currentRank === 'Unranked') {
                    console.log(`Rank ausente. Buscando histórico...`);
                    await delay(500); // Mais tempo antes da chamada pesada
                    
                    const matchesRes = await fetch(`https://api.henrikdev.xyz/valorant/v3/matches/${region}/${encodeURIComponent(name.trim())}/${encodeURIComponent(tag.trim())}?mode=competitive&size=1`, { headers });
                    const matchesData = await matchesRes.json();

                    if (matchesData.status === 200 && matchesData.data.length > 0) {
                        const match = matchesData.data[0];
                        const playerInMatch = match.players.find(pl => 
                            pl.name.toLowerCase() === name.trim().toLowerCase() && 
                            pl.tag.toLowerCase() === tag.trim().toLowerCase()
                        );

                        if (playerInMatch && playerInMatch.currenttier_patched) {
                            playerData.currentRank = playerInMatch.currenttier_patched;
                            console.log(`>>> Recuperado via Competitivo: ${playerData.currentRank}`);
                            
                            if (playerInMatch.currenttier > 2) {
                                playerData.currentRankIcon = `https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/${playerInMatch.currenttier}/smallicon.png`;
                            }
                        }
                    } else if (matchesData.status !== 200) {
                        console.warn(`⚠️ Falha no Histórico (${matchesData.status})`);
                    }
                }

            } catch (err) {
                console.error(`Erro crítico para ${p.riotId}`, err);
                playerData.apiError = true;
            }

            finalData.push(playerData);
            
            // AUMENTO DRÁSTICO DO DELAY ENTRE JOGADORES (3 Segundos)
            // Isso previne o erro 429 nas contas do final da lista
            console.log(`Aguardando cooldown...`);
            await delay(3000); 
        }

        fs.writeFileSync('data.json', JSON.stringify(finalData, null, 2));
        console.log('Sucesso! data.json atualizado.');

    } catch (error) {
        console.error('Erro fatal:', error);
        process.exit(1);
    }
}

run();
