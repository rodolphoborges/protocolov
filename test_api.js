const henrikApiKey = 'HDEV-f8ab178e-da4d-40d6-9426-e127dabe60b3';
const matchId = '2c7944be-f3c4-4429-a0fa-8d3604acd7a7';
const region = 'br';

const endpoints = [
    `https://api.henrikdev.xyz/valorant/v3/match/${region}/${matchId}`,
    `https://api.henrikdev.xyz/valorant/v2/match/${region}/${matchId}`,
    `https://api.henrikdev.xyz/valorant/v2/match/${matchId}`
];

async function testEndpoints() {
    const headers = { 'Authorization': henrikApiKey };
    for (const url of endpoints) {
        console.log(`Testing ${url}...`);
        try {
            const res = await fetch(url, { headers });
            console.log(`  Status: ${res.status}`);
            if (res.status === 200) {
                console.log(`  ✅ SUCCESS!`);
                const data = await res.json();
                console.log(`  Match found: ${data.data.metadata.matchid}`);
                return;
            }
        } catch (e) {
            console.log(`  Error: ${e.message}`);
        }
    }
}

testEndpoints();
