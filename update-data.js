// update-data.js
const fs = require('fs');

const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSFrlbFvaPDuVahEtPUOJdt4EfIBzCJvHITDIR5cEDHcFCBTEofMe_-gG57bSh5KCuqD2dnzuaFn66p/pub?output=csv';
const henrikApiKey = process.env.HENRIK_API_KEY; // A chave virá do GitHub Secrets agora

const delay = ms => new Promise(res => setTimeout(res, ms));

async function run() {
    try {
        // 1. Busca os dados do Google Sheets
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

            // Coleta todos os jogadores do CSV
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

        // 2. Busca os dados na API com delay para não tomar block
        for (const p of playersToFetch) {
            console.log(`Buscando dados de: ${p.riotId}`);
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
                const headers = { 'Authorization': henrikApiKey };
                const [accRes, mmrRes] = await Promise.all([
                    fetch(`https://api.henrikdev.xyz/valorant/v1/account/${encodeURIComponent(name.trim())}/${encodeURIComponent(tag.trim())}`, { headers }),
                    fetch(`https://api.henrikdev.xyz/valorant/v2/mmr/br/${encodeURIComponent(name.trim())}/${encodeURIComponent(tag.trim())}`, { headers })
                ]);

                const accData = await accRes.json();
                const mmrData = await mmrRes.json();

                if (accData.status === 200) {
                    playerData.level = accData.data.account_level;
                    playerData.card = accData.data.card.small;
                }
                if (mmrData.status === 200) {
                    playerData.currentRank = mmrData.data.current_data?.currenttierpatched || 'Sem Rank';
                    playerData.peakRank = mmrData.data.highest_rank?.patched_tier || 'Sem Rank';
                    playerData.currentRankIcon = mmrData.data.current_data?.images?.small || '';
                    const peakTier = mmrData.data.highest_rank?.tier;
                    if (peakTier > 2) playerData.peakRankIcon = `https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/${peakTier}/smallicon.png`;
                } else if (mmrData.status === 403 || mmrData.status === 404) {
                    playerData.currentRank = 'Privado/S. Rank';
                    playerData.peakRank = 'Privado/S. Rank';
                }
            } catch (err) {
                console.error(`Erro na API para ${p.riotId}`, err);
                playerData.apiError = true;
            }

            finalData.push(playerData);
            await delay(400); // Delay crucial de 400ms entre cada jogador
        }

        // 3. Salva os dados processados em um JSON local
        fs.writeFileSync('data.json', JSON.stringify(finalData, null, 2));
        console.log('Arquivo data.json atualizado com sucesso!');

    } catch (error) {
        console.error('Erro fatal:', error);
        process.exit(1);
    }
}

run();
