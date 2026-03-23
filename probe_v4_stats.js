require('dotenv').config();

const henrikApiKey = process.env.HENRIK_API_KEY;
const matchId = '5938b37b-527b-4ef6-bede-4c431ae7b427';
const region = 'br';
const headers = { 'Authorization': henrikApiKey };

async function probeV4RoundStats() {
    const url = `https://api.henrikdev.xyz/valorant/v4/match/${region}/${matchId}`;
    const res = await fetch(url, { headers });
    if (res.status === 200) {
        const json = await res.json();
        const round = json.data.rounds[0];
        console.log("round.stats type:", typeof round.stats);
        if (Array.isArray(round.stats)) {
            console.log("round.stats is an ARRAY of length", round.stats.length);
            console.log("First stat keys:", Object.keys(round.stats[0]).join(', '));
        }
    }
}

probeV4RoundStats();
