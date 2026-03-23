const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const oraculoUrl = process.env.ORACULO_SUPABASE_URL || 'https://jneuumdktavwzdwvcuhf.supabase.co';
const oraculoKey = process.env.ORACULO_SUPABASE_SERVICE_KEY || process.env.ORACULO_SUPABASE_ANON_KEY;

if (!oraculoUrl || !oraculoKey) {
    console.error("Faltam chaves do Oráculo!");
    process.exit(1);
}

const oraculo = createClient(oraculoUrl, oraculoKey);

async function check() {
    console.log("--- Verificando match_analysis_queue ---");
    const { data, error } = await oraculo
        .from('match_analysis_queue')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error("Erro ao buscar dados:", error);
    } else {
        console.log("Últimos 5 registros:");
        data.forEach(job => {
            console.log(`ID: ${job.id}, Match: ${job.match_id}, Tag: ${job.agente_tag}, Status: ${job.status}, Error: ${job.error_message || 'Nenhum'}`);
            // Check where the report is stored
            if (job.report) console.log("   -> Tem coluna 'report'");
            if (job.metadata && job.metadata.analysis) console.log("   -> Relatório em metadata.analysis");
        });
    }
}

check();
