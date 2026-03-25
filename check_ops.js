const { supabase, oraculo } = require('./db');

const matchIds = [
    'e910223e-2c48-48e1-b270-35bb5001b65f',
    '25fba675-09e4-4965-a409-c936702fd5e5',
    'e2b6105f-2f5e-4a29-b00b-364449b9cdea'
];

async function checkOperations() {
    for (const id of matchIds) {
        console.log(`\n--- Checking Match: ${id} ---`);

        // Check operations
        const { data: op, error: opErr } = await supabase
            .from('operations')
            .select('*')
            .eq('id', id)
            .maybeSingle();
        console.log(`Main DB (operations): ${op ? 'FOUND' : 'NOT FOUND'}`);
        if (opErr) console.error('Op Error:', opErr);

        // Check match_analysis_queue
        const { data: q, error: qErr } = await oraculo
            .from('match_analysis_queue')
            .select('*')
            .eq('match_id', id);
        console.log(`Oráculo Queue: ${q?.length > 0 ? `FOUND (${q.length})` : 'NOT FOUND'}`);
        if (qErr) console.error('Queue Error:', qErr);
    }
}

checkOperations();
