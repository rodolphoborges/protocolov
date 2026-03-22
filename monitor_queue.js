require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const oraculoUrl = process.env.ORACULO_SUPABASE_URL;
const oraculoKey = process.env.ORACULO_SUPABASE_SERVICE_KEY;
const oraculoDb = createClient(oraculoUrl, oraculoKey);

async function monitorQueue() {
    console.log("--- MONITORING ORÁCULO V QUEUE ---");
    
    const { data: counts, error } = await oraculoDb
        .from('match_analysis_queue')
        .select('status');

    if (error) {
        console.error("Error fetching queue status:", error);
        return;
    }

    const stats = counts.reduce((acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
    }, {});

    console.log("Queue Stats:", stats);
    
    // Peek at the last processed ones
    const { data: recent } = await oraculoDb
        .from('match_analysis_queue')
        .select('agente_tag, processed_at, status')
        .order('processed_at', { ascending: false })
        .limit(5);

    console.log("\nRecently Processed:");
    console.table(recent);
}

monitorQueue();
