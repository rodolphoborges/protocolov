const { supabase, oraculo } = require('./db');

const MATCH_ID = '664f2cdf-66fd-4b40-b4be-414558421045';

async function check() {
    console.log(`--- Checking Match: ${MATCH_ID} ---`);

    // 1. Check operations table
    const { data: op, error: opError } = await supabase
        .from('operations')
        .select('*')
        .eq('id', MATCH_ID)
        .single();
    
    if (opError) {
        console.log('Operations Table: Not found or error.', opError.message);
    } else {
        console.log('Operations Table: Found');
        console.log(JSON.stringify(op, null, 2));
    }

    // 2. Check operation_squads table
    const { data: squad, error: squadError } = await supabase
        .from('operation_squads')
        .select('*')
        .eq('operation_id', MATCH_ID);
    
    if (squadError) {
        console.log('Squads Table: Error.', squadError.message);
    } else {
        console.log(`Squads Table: Found ${squad ? squad.length : 0} members`);
        console.log(JSON.stringify(squad, null, 2));
    }

    // 3. Check players table for squad members
    const riotIds = squad.map(m => m.riot_id);
    const { data: players, error: playersError } = await supabase
        .from('players')
        .select('riot_id, telegram_id')
        .in('riot_id', riotIds);

    if (playersError) {
        console.log('Players Table: Error.', playersError.message);
    } else {
        console.log(`Players Table: Found ${players ? players.length : 0} players`);
        console.log(JSON.stringify(players, null, 2));
    }

    // 4. Check match_analysis_queue table
    if (oraculo) {
        const { data: queue, error: queueError } = await oraculo
            .from('match_analysis_queue')
            .select('*')
            .eq('match_id', MATCH_ID);
        
        if (queueError) {
            console.log('Queue Table: Error.', queueError.message);
        } else {
            console.log(`Queue Table: Found ${queue ? queue.length : 0} entries`);
            console.log(JSON.stringify(queue, null, 2));
        }
    } else {
        console.log('Oráculo connection not available.');
    }
}

check();
