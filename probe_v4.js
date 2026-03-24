/**
 * PROTOCOLO V - UNIFIED PROBE V4
 * Uso: node probe_v4.js [metadata|damage|stats|round|player|deep] [matchId]
 */
require('dotenv').config();

const henrikApiKey = process.env.HENRIK_API_KEY;
const region = 'br';
const headers = { 'Authorization': henrikApiKey };

async function probeV4() {
    const type = process.argv[2] || 'metadata';
    const matchId = process.argv[3] || '5938b37b-527b-4ef6-bede-4c431ae7b427';

    console.log(`📡 Probing V4 [${type.toUpperCase()}] for match ${matchId} in region ${region}...`);
    
    // Na V4 da HenrikDev, a estrutura de URL costuma ser consistente
    // Alguns endpoints podem variar, este script foca na estrutura base
    const url = `https://api.henrikdev.xyz/valorant/v4/match/${region}/${matchId}`;
    
    try {
        const res = await fetch(url, { headers });
        console.log(`Status: ${res.status} ${res.statusText}`);
        
        if (res.status === 200) {
            const json = await res.json();
            const data = json.data;
            
            console.log("--- Resumo de Dados ---");
            console.log("Keys disponíveis:", Object.keys(data).join(', '));
            
            if (type === 'metadata') {
                console.log("Metadata:", data.metadata);
            } else if (type === 'players') {
                console.log("Total Agentes:", data.players.length);
            } else if (data[type]) {
                console.log(`Dados de ${type}:`, typeof data[type] === 'object' ? Object.keys(data[type]) : data[type]);
            } else {
                console.log(`Aviso: Chave '${type}' não encontrada na raiz do objeto 'data'.`);
            }
        } else {
            const text = await res.text();
            console.error("Erro da API:", text);
        }
    } catch (err) {
        console.error("Erro na requisição:", err.message);
    }
}

if (!henrikApiKey) {
    console.error("❌ ERRO: HENRIK_API_KEY não encontrada no ambiente.");
    process.exit(1);
}

probeV4();
