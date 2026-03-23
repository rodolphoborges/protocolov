const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const oraculoUrl = process.env.ORACULO_SUPABASE_URL;
const oraculoKey = process.env.ORACULO_SUPABASE_SERVICE_KEY;

const oraculo = createClient(oraculoUrl, oraculoKey);

async function checkColumns() {
    const { data, error } = await oraculo
        .from('match_analysis_queue')
        .select('*')
        .limit(1);

    if (error) {
        console.error("Erro:", error);
    } else if (data && data.length > 0) {
        console.log("Colunas encontradas:", Object.keys(data[0]).join(', '));
    } else {
        console.log("Nenhum dado para verificar colunas.");
    }
}

checkColumns();
