const { oraculo: supabase } = require('./db');

async function countAffected() {
    const { data, error } = await supabase
        .from('match_analysis_queue')
        .select('id, metadata')
        .eq('status', 'completed');

    if (error) {
        console.error('Error:', error);
        return;
    }

    const affected = data.filter(d => !d.metadata?.analysis?.first_bloods);
    console.log(`Total completed analyses: ${data.length}`);
    console.log(`Analyses needing update: ${affected.length}`);
    
    if (affected.length > 0) {
        console.log('Sample affected IDs:', affected.slice(0, 3).map(a => a.id));
    }
}

countAffected();
