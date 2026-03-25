const { oraculo: supabase } = require('../../src/db');

const matchId = '2c7944be-f3c4-4429-a0fa-8d3604acd7a7';
const playerTag = 'DefeitoDeFábrica#ZzZ';

async function check() {
    const { data, error } = await supabase
        .from('match_analysis_queue')
        .select('match_id, agente_tag, status, metadata')
        .eq('match_id', matchId)
        .eq('agente_tag', playerTag)
        .single();

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Record found:', data.match_id, data.agente_tag);
        console.log('Status:', data.status);
        console.log('Has analysis meta:', !!data.metadata?.analysis);
    }
}

check();
