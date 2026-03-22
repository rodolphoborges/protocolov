require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const oraculoUrl = process.env.ORACULO_SUPABASE_URL;
const oraculoKey = process.env.ORACULO_SUPABASE_SERVICE_KEY;
const oraculoDb = createClient(oraculoUrl, oraculoKey);

async function checkRaw() {
    const { data: recent } = await oraculoDb
        .from('match_analysis_queue')
        .select('metadata')
        .order('processed_at', { ascending: false })
        .limit(1);

    if (recent && recent.length > 0) {
        console.log("RAW Metadata:", JSON.stringify(recent[0].metadata, null, 2));
    }
}

checkRaw();
