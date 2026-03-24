const { oraculo: supabase } = require('./db');

async function inspectMatches() {
    const { data, error } = await supabase
        .from('match_analysis_queue')
        .select('id, match_id, agente_tag, metadata')
        .eq('status', 'completed');

    if (error) {
        console.error('Error:', error);
        return;
    }

    const affected = data.filter(d => !d.metadata?.analysis?.first_bloods || !d.metadata?.analysis?.estimated_rank);
    const uniqueMatches = [...new Set(affected.map(a => a.match_id))];
    
    console.log(`Analyses needing update: ${affected.length}`);
    console.log(`Unique match IDs among affected: ${uniqueMatches.length}`);
}

inspectMatches();
