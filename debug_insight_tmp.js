const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://gzbzfmvgwfvzjqurowku.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6YnpmbXZnd2Z2empxdXJvd2t1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTg0NzM5NywiZXhwIjoyMDg3NDIzMzk3fQ.qG5sY4EDrHp_GfJoRVUAMLJYHiz1UqyCtZNWgBJKf8A');

async function debug() {
    const { data, error } = await supabase
        .from('ai_insights')
        .select('*')
        .eq('match_id', 'f3211366-68db-479e-9c24-d55002e09913')
        .ilike('player_id', 'm4sna#chama')
        .single();
    
    if (error) {
        console.error('Error:', error.message);
    } else {
        console.log('--- INSIGHT RESUMO (FULL) ---');
        console.log(data.insight_resumo); 
        console.log('\n--- TYPE OF INSIGHT RESUMO ---');
        console.log(typeof data.insight_resumo);

        if (data.analysis_report && data.analysis_report.conselhos_ia) {
            console.log('\n--- CONSELHOS IA (from report) ---');
            console.log(data.analysis_report.conselhos_ia);
        }
    }
}

debug();
