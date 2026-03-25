const { oraculo: supabase } = require('../../src/db');

const matchId = '2c7944be-f3c4-4429-a0fa-8d3604acd7a7';

async function listPlayers() {
    const { data, error } = await supabase
        .from('match_analysis_queue')
        .select('agente_tag')
        .eq('match_id', matchId);

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Players in this match:', data.map(d => d.agente_tag));
    }
}

listPlayers();
