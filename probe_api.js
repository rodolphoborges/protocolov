require('dotenv').config();

const henrikApiKey = process.env.HENRIK_API_KEY;
const matchId = '5938b37b-527b-4ef6-bede-4c431ae7b427';
const headers = { 'Authorization': henrikApiKey };

async function probe() {
    console.log(`📡 Probing V2 for match ${matchId}...`);
    const url = `https://api.henrikdev.xyz/valorant/v2/match/${matchId}`;
    const res = await fetch(url, { headers });
    console.log(`Status: ${res.status}`);
    if (res.status === 200) {
        const json = await res.json();
        console.log("Keys in data:", Object.keys(json.data).join(', '));
        if (json.data.players) {
            console.log("Players type:", typeof json.data.players);
            console.log("Players keys:", Object.keys(json.data.players).join(', '));
        }
    }
}

probe();
