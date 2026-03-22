const henrikApiKey = 'HDEV-f8ab178e-da4d-40d6-9426-e127dabe60b3';
const matchId = '2c7944be-f3c4-4429-a0fa-8d3604acd7a7';

async function inspectV2() {
    const url = `https://api.henrikdev.xyz/valorant/v2/match/${matchId}`;
    const headers = { 'Authorization': henrikApiKey };
    
    console.log(`Fetching match ${matchId} (v2)...`);
    try {
        const response = await fetch(url, { headers });
        const data = await response.json();
        const match = data.data;
        
        console.log('Root keys:', Object.keys(match));
        if (match.rounds && match.rounds[0]) {
            console.log('Round 0 keys:', Object.keys(match.rounds[0]));
        }
        
        if (match.kills) {
            console.log('Match has root kills array. Length:', match.kills.length);
            console.log('First kill sample:', JSON.stringify(match.kills[0], null, 2));
        }

        // Check player stats in round 0
        if (match.rounds && match.rounds[0].player_stats) {
            console.log('Round 0 player_stats[0] keys:', Object.keys(match.rounds[0].player_stats[0]));
        }

    } catch (e) {
        console.error('Error:', e);
    }
}

inspectV2();
