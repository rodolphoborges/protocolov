const { oraculo: supabase } = require('./db');

const matchIds = [
    'e910223e-2c48-48e1-b270-35bb5001b65f',
    '25fba675-09e4-4965-a409-c936702fd5e5',
    'e2b6105f-2f5e-4a29-b00b-364449b9cdea'
];

async function checkMatches() {
    for (const id of matchIds) {
        console.log(`\n--- Checking Match: ${id} ---`);

        // Check raw_matches
        const { data: raw, error: rawErr } = await supabase
            .from('raw_matches')
            .select('match_id, metadata')
            .eq('match_id', id)
            .maybeSingle();
        console.log(`Raw matches table: ${raw ? 'FOUND' : 'NOT FOUND'}`);

        // Check matches
        const { data: match, error: matchErr } = await supabase
            .from('matches')
            .select('match_id, metadata')
            .eq('match_id', id)
            .maybeSingle();
        console.log(`Matches table: ${match ? 'FOUND' : 'NOT FOUND'}`);

        // Check match_analysis_queue
        const { data: queue, error: queueErr } = await supabase
            .from('match_analysis_queue')
            .select('id, match_id, status')
            .eq('match_id', id);
        console.log(`Match analysis queue: ${queue?.length > 0 ? `FOUND (${queue.length} entries)` : 'NOT FOUND'}`);
        if (queue?.length > 0) {
            console.log('Statuses:', queue.map(q => q.status).join(', '));
        }
    }
}

checkMatches();
