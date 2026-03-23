require('dotenv').config();

const henrikApiKey = process.env.HENRIK_API_KEY;
const matchId = '5938b37b-527b-4ef6-bede-4c431ae7b427';
const region = 'br';
const headers = { 'Authorization': henrikApiKey };

async function probeV4Deep() {
    const url = `https://api.henrikdev.xyz/valorant/v4/match/${region}/${matchId}`;
    const res = await fetch(url, { headers });
    if (res.status === 200) {
        const json = await res.json();
        const stat = json.data.rounds[0].stats[0];
        console.log("stat.player:", JSON.stringify(stat.player));
        console.log("stat.stats:", JSON.stringify(stat.stats));
    }
}

probeV4Deep();
