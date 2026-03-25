require('dotenv').config();
const henrikApiKey = process.env.HENRIK_API_KEY;

const players = [
    { name: 'm4sna', tag: 'chama' },
    { name: 'DefeitoDeFábrica', tag: 'ZzZ' }
];

async function checkHistory() {
    for (const p of players) {
        const url = `https://api.henrikdev.xyz/valorant/v3/matches/br/${encodeURIComponent(p.name)}/${encodeURIComponent(p.tag)}?size=20`;
        const headers = { 'Authorization': henrikApiKey };
        
        console.log(`\n--- Fetching history (V3) for: ${p.name}#${p.tag} ---`);
        try {
            const response = await fetch(url, { headers });
            if (response.status !== 200) {
                console.error(`Error: ${response.status} ${response.statusText}`);
                continue;
            }
            const json = await response.json();
            const matches = json.data || [];
            console.log(`Found ${matches.length} matches in history.`);
            matches.forEach(m => {
                console.log(`- ${m.metadata.matchid} (${m.metadata.mode})`);
            });
        } catch (e) {
            console.error('Fetch error:', e);
        }
    }
}

checkHistory();
