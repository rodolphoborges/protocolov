require('dotenv').config();
const henrikApiKey = process.env.HENRIK_API_KEY;

const p = { name: 'm4sna', tag: 'chama' };

async function checkHistory() {
    const url = `https://api.henrikdev.xyz/valorant/v3/matches/br/${encodeURIComponent(p.name)}/${encodeURIComponent(p.tag)}?size=20`;
    const headers = { 'Authorization': henrikApiKey };
    
    console.log(`\n--- Fetching history (V3) for: ${p.name}#${p.tag} ---`);
    try {
        const response = await fetch(url, { headers });
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
                console.log(`\nMatch found: ${mId}`);
                console.log('Mode:', match.metadata.mode);
                const players = match.players?.all_players || [];
                console.log('Players found in match object:', players.length);
                if (players.length > 0) {
                    console.log('Sample player:', players[0].name + '#' + players[0].tag);
                } else {
                    console.log('Players structure:', Object.keys(match.players || {}));
                }
            } else {
                console.log(`Match NOT found in history: ${mId}`);
            }
        }
    } catch (e) {
        console.error('Fetch error:', e);
    }
}

checkHistory();
