const { oraculo: supabase } = require('../../src/db');

async function inspect() {
    const { data, error } = await supabase
        .from('match_analysis_queue')
        .select('*')
        .eq('match_id', '2c7944be-f3c4-4429-a0fa-8d3604acd7a7')
        .eq('agente_tag', 'Guxxtavo#easy')
        .single();

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('--- Match Analysis Data ---');
    console.log(JSON.stringify(data, null, 2));
}

inspect();
