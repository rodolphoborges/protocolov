// update-data.js
const fs = require('fs');

const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSFrlbFvaPDuVahEtPUOJdt4EfIBzCJvHITDIR5cEDHcFCBTEofMe_-gG57bSh5KCuqD2dnzuaFn66p/pub?output=csv';
const henrikApiKey = process.env.HENRIK_API_KEY;

const delay = ms => new Promise(res => setTimeout(res, ms));

async function run() {
    try {
        // 1. Busca os dados do Google Sheets
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

        // 2. Busca dados (Sequencial para descobrir a região correta primeiro)
        for (const p of playersToFetch) {
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
                // Passo A: Busca a conta para descobrir a Região (br, na, latam, etc)
                const accRes = await fetch(`https://api.henrikdev.xyz/valorant/v1/account/${encodeURIComponent(name.trim())}/${encodeURIComponent(tag.trim())}`, { headers });
                const accData = await accRes.json();

                let region = 'br'; // Fallback padrão

                if (accData.status === 200) {
                    playerData.level = accData.data.account_level;
                    playerData.card = accData.data.card.small;
                    region = accData.data.region; // Pega a região correta da conta
                }

                // Passo B: Busca o MMR usando a região correta descoberta acima
                const mmrRes = await fetch(`https://api.henrikdev.xyz/valorant/v2/mmr/${region}/${encodeURIComponent(name.trim())}/${encodeURIComponent(tag.trim())}`, { headers });
                const mmrData = await mmrRes.json();

                if (mmrData.status === 200) {
                    // Tenta pegar o rank atual. Se for null (unranked), mantém o padrão 'Sem Rank'
                    if (mmrData.data.current_data && mmrData.data.current_data.currenttierpatched) {
                        playerData.currentRank = mmrData.data.current_data.currenttierpatched;
                        playerData.currentRankIcon = mmrData.data.current_data.images.small;
                    }

                    // Tenta pegar o rank máximo
                    if (mmrData.data.highest_rank && mmrData.data.highest_rank.patched_tier) {
                        playerData.peakRank = mmrData.data.highest_rank.patched_tier;
                        const peakTier = mmrData.data.highest_rank.tier;
                        if (peakTier > 2) {
                            playerData.peakRankIcon = `https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/${peakTier}/smallicon.png`;
                        }
                    }
                } else {
                     // Se der erro 404 no MMR, pode ser que o jogador nunca tenha jogado ranked
                    console.warn(`MMR não encontrado na região ${region} para ${p.riotId}`);
                }

            } catch (err) {
                console.error(`Erro na API para ${p.riotId}`, err);
                playerData.apiError = true;
            }

            finalData.push(playerData);
            await delay(400); // Delay para respeitar o rate limit
        }

        // 3. Salva
        fs.writeFileSync('data.json', JSON.stringify(finalData, null, 2));
        console.log('Sucesso! data.json atualizado.');

    } catch (error) {
        console.error('Erro fatal:', error);
        process.exit(1);
    }
}

run();
