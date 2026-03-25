require('dotenv').config();
const henrikApiKey = process.env.HENRIK_API_KEY;

const p = { name: 'm4sna', tag: 'chama' };

async function checkHistory() {
    const url = `https://api.henrikdev.xyz/valorant/v3/matches/br/${encodeURIComponent(p.name)}/${encodeURIComponent(p.tag)}?size=20`;
    const headers = { 'Authorization': henrikApiKey };
    
    try {
        const response = await fetch(url, { headers });
        const json = await response.json();
        const matches = json.data || [];
        
        if (matches.length > 0) {
            console.log('--- FIRST MATCH METADATA ---');
            console.log(JSON.stringify(matches[0].metadata, null, 2));
            console.log('--- FIRST MATCH PLAYERS KEYS ---');
            console.log(Object.keys(matches[0].players || {}));
        }

        const targetIds = [
            'e910223e-2c48-48e1-b270-35bb5001b65f',
            '25fba675-09e4-4965-a409-c936702fd5e5',
            'e2b6105f-2f5e-4a29-b00b-364449b9cdea'
        ];

        matches.forEach(m => {
            const mId = m.metadata.matchid || m.metadata.match_id || m.matchid;
            if (targetIds.includes(mId)) {
                console.log(`\nFound Match: ${mId}`);
                console.log('Players array exists?', !!m.players);
                if (m.players) {
                    const players = m.players.all_players || m.players;
                    console.log('Players count:', Array.isArray(players) ? players.length : 'N/A');
                }
            }
        });
    } catch (e) {
        console.error('Fetch error:', e);
    }
}

checkHistory();
