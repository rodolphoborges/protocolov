require('dotenv').config();
const { oraculo: supabase } = require('./db');
const henrikApiKey = process.env.HENRIK_API_KEY;

const name = 'Guxxtavo';
const tag = 'easy';
const region = 'br';

async function fetchHistory() {
    const url = `https://api.henrikdev.xyz/valorant/v3/matches/${region}/${name}/${tag}?size=5`;
    const headers = { 'Authorization': henrikApiKey };
    
    console.log(`Fetching history for ${name}#${tag} in ${region}...`);
    try {
        const response = await fetch(url, { headers });
        if (response.status !== 200) {
            console.error(`Error: ${response.status} ${response.statusText}`);
            const text = await response.text();
            console.error(text);
            return;
        }
        const data = await response.json();
        console.log('Matches found:', data.data.length);
        data.data.forEach(m => {
            console.log(`Match ID: ${m.metadata.matchid}, Mode: ${m.metadata.mode}, Map: ${m.metadata.map}`);
        });
    } catch (e) {
        console.error('Fetch error:', e);
    }
}

fetchHistory();
