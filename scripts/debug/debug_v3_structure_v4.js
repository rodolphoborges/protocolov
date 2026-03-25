require('dotenv').config();
const { smartFetch } = require('../../src/../services/api-client');
const henrikApiKey = process.env.HENRIK_API_KEY;

const p = { name: 'm4sna', tag: 'chama' };

async function checkHistory() {
    const url = `https://api.henrikdev.xyz/valorant/v3/matches/br/${encodeURIComponent(p.name)}/${encodeURIComponent(p.tag)}?size=20`;
    const headers = { 'Authorization': henrikApiKey };
    
    try {
        const response = await smartFetch(url, headers);
        const json = await response.json();
        const matches = json.data || [];
        
        const targetIds = [
            'e910223e-2c48-48e1-b270-35bb5001b65f',
            '25fba675-09e4-4965-a409-c936702fd5e5',
            'e2b6105f-2f5e-4a29-b00b-364449b9cdea'
        ];

        for (const mId of targetIds) {
            const match = matches.find(m => m.metadata.matchid === mId);
            if (match) {
                const rawMode = match.metadata.queue?.id || match.metadata.mode || '';
                const mode = rawMode.toLowerCase();
                console.log(`\nMatch: ${mId}`);
                console.log(`- Metadata Queue: ${JSON.stringify(match.metadata.queue)}`);
                console.log(`- Metadata Mode: ${match.metadata.mode}`);
                console.log(`- Calculated Mode (raw): ${rawMode}`);
                console.log(`- Calculated Mode (lower): ${mode}`);
                
                const playersArray = match.players?.all_players || [];
                const rosterMap = new Set(['m4sna#chama', 'defeitodefábrica#zzz', 'pilako#3186']);
                const squadMembers = playersArray.filter(player => 
                    rosterMap.has(`${player.name}#${player.tag}`.toLowerCase().replace(/\s/g, ''))
                );
                console.log(`- Squad Members Count: ${squadMembers.length}`);
            }
        }
    } catch (e) {
        console.error('Fetch error:', e);
    }
}

checkHistory();
