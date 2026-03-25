const { supabase, oraculo } = require('./db');

async function reprocess() {
    console.log('--- REPROCESS MISSING MATCHES (Last 48 Hours) ---');

    if (!oraculo) {
        console.error('Oráculo connection not configured.');
        return;
    }

    // 1. Get competitive matches from the last 48 hours
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).getTime();
    const { data: ops, error: opsError } = await supabase
        .from('operations')
        .select('id, map, mode, started_at')
        .eq('mode', 'Competitive')
        .gte('started_at', fortyEightHoursAgo);

    if (opsError) {
        console.error('Error fetching operations:', opsError.message);
        return;
    }

    console.log(`Found ${ops.length} competitive matches in the last 48 hours.`);

    // 2. For each match, check if it's already in the queue (as AUTO or individual)
    let queuedCount = 0;
    for (const op of ops) {
        const { data: queue, error: queueError } = await oraculo
            .from('match_analysis_queue')
            .select('id')
            .eq('match_id', op.id)
            .limit(1);

        if (queueError) {
            console.error(`Error checking queue for ${op.id}:`, queueError.message);
            continue;
        }

        if (queue && queue.length > 0) {
            // Already has some entry, skip
            continue;
        }

        // 3. Insert AUTO job
        console.log(`[+] Queueing match ${op.id} (${op.map})`);
        const { error: insertError } = await oraculo
            .from('match_analysis_queue')
            .insert([{
                match_id: op.id,
                agente_tag: 'AUTO',
                status: 'pending',
                metadata: { reprocessed: true }
            }]);

        if (insertError) {
            console.error(`Error inserting job for ${op.id}:`, insertError.message);
        } else {
            queuedCount++;
        }
    }

    console.log(`\n✅ Reprocessing complete. ${queuedCount} matches queued for analysis.`);
}

reprocess();
