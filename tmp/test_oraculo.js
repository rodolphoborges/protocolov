const axios = require('axios');

async function test() {
    const briefing = {
        match_id: '3845ece1-7125-470a-8e0a-7dda33a15489',
        player_id: 'Ministro Xandao#peixe',
        map_name: 'Ascent',
        agent_name: 'Jett',
        squad_stats: []
    };

    try {
        console.log('Enviando requisição para o Oráculo...');
        const res = await axios.post('http://localhost:3000/api/analyze', briefing, {
            headers: { 'x-api-key': 'ORACULO_V_TACTICAL_INTELLIGENCE_2026' },
            timeout: 5000 // Curto para o teste
        });
        console.log('Resposta:', res.data);
    } catch (err) {
        console.error('--- DETALHES DO ERRO ---');
        console.error('Mensagem:', err.message);
        if (err.response) {
            console.error('Status:', err.response.status);
            console.error('Data:', JSON.stringify(err.response.data));
        } else if (err.request) {
            console.error('Sem resposta do servidor (request sent).');
        } else {
            console.error('Erro na configuração da requisição:', err.message);
        }
    }

}

test();
