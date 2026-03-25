const { oraculo: supabase } = require('../../src/db');

async function inspect() {
    const { data, error } = await supabase
        .from('match_analysis_queue')
        .select('metadata')
        .eq('match_id', '2c7944be-f3c4-4429-a0fa-8d3604acd7a7')
        .eq('agente_tag', 'Guxxtavo#easy')
        .single();

    if (error) {
        console.error('Error:', error);
        return;
    }

    const report = data.metadata.analysis || {};
    console.log('--- FB Info ---');
    console.log('first_bloods:', report.first_bloods);
    console.log('first_kills:', report.first_kills);
    console.log('FK (if exists):', report.fk);
    console.log('Keys in report:', Object.keys(report));
    
    // Check if any round has FIRST_BLOOD in tactical_events
    const rounds = report.rounds || [];
    rounds.forEach(r => {
        const fb = r.tactical_events?.some(e => (typeof e === 'string' && e.includes('FIRST_BLOOD')) || (e.type && e.type.includes('FIRST_BLOOD')));
        if (fb) console.log(`Round ${r.round} has FB`);
    });
}

inspect();
