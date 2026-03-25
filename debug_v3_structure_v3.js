require('dotenv').config();
const { smartFetch } = require('./services/api-client');
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
            const m = matches.find(match => match.metadata.matchid === mId);
            if (m) {
                console.log(`\n--- Match structure for ${mId} ---`);
                console.log('Metadata Mode:', m.metadata.mode);
                console.log('Metadata Queue:', m.metadata.queue);
                console.log('Players structure keys:', Object.keys(m.players || {}));
                if (m.players) {
                    if (Array.isArray(m.players)) {
                        console.log('Players is ARRAY, length:', m.players.length);
                    } else if (m.players.all_players) {
                        console.log('Players.all_players is ARRAY, length:', m.players.all_players.length);
                        if (m.players.all_players.length > 0) {
                            const p0 = m.players.all_players[0];
                            console.log('Sample player keys:', Object.keys(p0));
                            console.log('Sample player:', p0.name + '#' + p0.tag, 'Team:', p0.team);
                        }
                    }
                }
            } else {
                console.log(`Match ${mId} not found in this history slice.`);
            }
        }
    } catch (e) {
        console.error('Fetch error:', e);
    }
}

checkHistory();
