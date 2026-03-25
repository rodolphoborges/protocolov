require('dotenv').config();
const henrikApiKey = process.env.HENRIK_API_KEY;
const region = 'br';

const matchIds = [
    'e910223e-2c48-48e1-b270-35bb5001b65f',
    '25fba675-09e4-4965-a409-c936702fd5e5',
    'e2b6105f-2f5e-4a29-b00b-364449b9cdea'
];

async function fetchMatches() {
    for (const matchId of matchIds) {
        // Probando com V4
        const url = `https://api.henrikdev.xyz/valorant/v4/match/${region}/${matchId}`;
        const headers = { 'Authorization': henrikApiKey };
        
        console.log(`\n--- Fetching match (V4): ${matchId} ---`);
        try {
            const response = await fetch(url, { headers });
            if (response.status !== 200) {
                console.error(`Error: ${response.status} ${response.statusText}`);
                const body = await response.text();
                // Verifying if the error specifies region
                if (body.includes("region")) {
                    console.log("Error details:", body);
                }
                continue;
            }
            const json = await response.json();
            const data = json.data;
            const players = data.players || [];
            console.log(`Players in match: ${players.length}`);
            players.forEach(p => {
                console.log(`- ${p.name}#${p.tag} (Team: ${p.team})`);
            });
            console.log(`Mode: ${data.metadata?.queue || data.metadata?.mode}`);
        } catch (e) {
            console.error('Fetch error:', e);
        }
    }
}

fetchMatches();
