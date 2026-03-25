require('dotenv').config();

const henrikApiKey = process.env.HENRIK_API_KEY;
const matchId = '5938b37b-527b-4ef6-bede-4c431ae7b427';
const region = 'br';
const headers = { 'Authorization': henrikApiKey };

async function probeV4() {
    console.log(`📡 Probing V4 for match ${matchId} in region ${region}...`);
    const url = `https://api.henrikdev.xyz/valorant/v4/match/${region}/${matchId}`;
    const res = await fetch(url, { headers });
    console.log(`Status: ${res.status}`);
    if (res.status === 200) {
        const json = await res.json();
        const match = json.data;
        console.log("Keys in data:", Object.keys(match).join(', '));
        if (match.players) {
            console.log("Players type:", typeof match.players);
            if (Array.isArray(match.players)) {
                console.log("Players is an ARRAY of length", match.players.length);
            }
        }
    }
}

probeV4();
