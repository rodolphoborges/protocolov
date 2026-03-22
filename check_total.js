require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const oraculoUrl = process.env.ORACULO_SUPABASE_URL;
const oraculoKey = process.env.ORACULO_SUPABASE_SERVICE_KEY;
const oraculoDb = createClient(oraculoUrl, oraculoKey);

async function checkTotal() {
    const { count, error } = await oraculoDb
        .from('match_analysis_queue')
        .select('*', { count: 'exact', head: true });

    if (error) {
        console.error("Error fetching count:", error);
    } else {
        console.log("Total Jobs In Queue:", count);
    }
}

checkTotal();
