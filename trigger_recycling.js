require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const oraculoUrl = process.env.ORACULO_SUPABASE_URL;
const oraculoKey = process.env.ORACULO_SUPABASE_SERVICE_KEY;
const oraculoDb = createClient(oraculoUrl, oraculoKey);

async function triggerRecycling() {
    console.log("Triggering global recycling via direct access...");
    
    // Set all completed and failed jobs back to pending
    const { data, error } = await oraculoDb
        .from('match_analysis_queue')
        .update({ 
            status: 'pending',
            error_message: null
        })
        .in('status', ['completed', 'failed']);

    if (error) {
        console.error("Error triggering recycling:", error);
    } else {
        console.log("✅ Global recycling triggered successfully!");
    }
}

triggerRecycling();
