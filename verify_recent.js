require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const oraculoUrl = process.env.ORACULO_SUPABASE_URL;
const oraculoKey = process.env.ORACULO_SUPABASE_SERVICE_KEY;
const oraculoDb = createClient(oraculoUrl, oraculoKey);

async function verifyRecent() {
    console.log("--- VERIFYING RECENT RE-PROCESSING ---");
    
    const { data: recent } = await oraculoDb
        .from('match_analysis_queue')
        .select('*')
        .order('processed_at', { ascending: false })
        .limit(1);

    if (recent && recent.length > 0) {
        const item = recent[0];
        const report = item.metadata.analysis;
        console.log(`Player: ${item.agente_tag}`);
        console.log(`First Bloods: ${report.first_bloods}`);
        console.log(`Holt L/T: ${report.holt.performance_l} / ${report.holt.performance_t}`);
        console.log(`KAIO Advice: ${report.conselho_kaio.substring(0, 50)}...`);
    }
}

verifyRecent();
