require('dotenv').config();

const henrikApiKey = process.env.HENRIK_API_KEY;
const matchId = '5938b37b-527b-4ef6-bede-4c431ae7b427';
const region = 'br';
const headers = { 'Authorization': henrikApiKey };

async function probeV4Round() {
    console.log(`📡 Probing V4 Round for match ${matchId}...`);
    const url = `https://api.henrikdev.xyz/valorant/v4/match/${region}/${matchId}`;
    const res = await fetch(url, { headers });
    if (res.status === 200) {
        const json = await res.json();
        const round = json.data.rounds[0];
        console.log("Round keys:", Object.keys(round).join(', '));
        if (round.player_stats) {
            console.log("player_stats type:", typeof round.player_stats);
            if (Array.isArray(round.player_stats)) {
                console.log("player_stats is an ARRAY");
            } else {
                console.log("player_stats keys:", Object.keys(round.player_stats).join(', '));
            }
        }
    }
}

probeV4Round();
