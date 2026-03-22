const { createClient } = require('@supabase/supabase-js');

const url = 'https://jneuumdktavwzdwvcuhf.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpuZXV1bWRrdGF2d3pkd3ZjdWhmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzk4MDIzMSwiZXhwIjoyMDg5NTU2MjMxfQ.hJnAuAxHM_LCXi_sELcvwOIpkUx-per0nwtZBaprSrk';
const supabase = createClient(url, key);

async function inspect() {
    const { data, error } = await supabase
        .from('match_analysis_queue')
        .select('*')
        .eq('match_id', '2c7944be-f3c4-4429-a0fa-8d3604acd7a7')
        .eq('agente_tag', 'Guxxtavo#easy')
        .single();

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('--- Match Analysis Data ---');
    console.log(JSON.stringify(data, null, 2));
}

inspect();
