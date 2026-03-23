require('dotenv').config();

const henrikApiKey = process.env.HENRIK_API_KEY;
const matchId = '5938b37b-527b-4ef6-bede-4c431ae7b427';
const region = 'br';
const headers = { 'Authorization': henrikApiKey };

async function probeV4Player() {
    const url = `https://api.henrikdev.xyz/valorant/v4/match/${region}/${matchId}`;
    const res = await fetch(url, { headers });
    if (res.status === 200) {
        const json = await res.json();
        const player = json.data.players[0];
        console.log("Player keys:", Object.keys(player).join(', '));
        console.log("Player.stats keys:", Object.keys(player.stats).join(', '));
    }
}

probeV4Player();
