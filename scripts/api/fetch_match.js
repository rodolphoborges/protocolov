require('dotenv').config();
const henrikApiKey = process.env.HENRIK_API_KEY;
const matchId = '2c7944be-f3c4-4429-a0fa-8d3604acd7a7';
const region = 'br';

async function fetchMatch() {
    const url = `https://api.henrikdev.xyz/valorant/v3/match/${region}/${matchId}`;
    const headers = { 'Authorization': henrikApiKey };
    
    console.log(`Fetching match ${region}/${matchId}...`);
    try {
        const response = await fetch(url, { headers });
        if (response.status !== 200) {
            console.error(`Error: ${response.status} ${response.statusText}`);
            const text = await response.text();
            console.error(text);
            return;
        }
        const data = await response.json();
        const fs = require('fs');
        fs.writeFileSync('match_raw.json', JSON.stringify(data, null, 2));
        console.log('Match data saved to match_raw.json');
    } catch (e) {
        console.error('Fetch error:', e);
    }
}

fetchMatch();
