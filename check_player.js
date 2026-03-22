const { createClient } = require('@supabase/supabase-js');

const url = 'https://jneuumdktavwzdwvcuhf.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpuZXV1bWRrdGF2d3pkd3ZjdWhmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzk4MDIzMSwiZXhwIjoyMDg5NTU2MjMxfQ.hJnAuAxHM_LCXi_sELcvwOIpkUx-per0nwtZBaprSrk';
const supabase = createClient(url, key);

const matchId = '2c7944be-f3c4-4429-a0fa-8d3604acd7a7';
const playerTag = 'DefeitoDeFábrica#ZzZ';

async function check() {
    const { data, error } = await supabase
        .from('match_analysis_queue')
        .select('match_id, agente_tag, status, metadata')
        .eq('match_id', matchId)
        .eq('agente_tag', playerTag)
        .single();

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Record found:', data.match_id, data.agente_tag);
        console.log('Status:', data.status);
        console.log('Has analysis meta:', !!data.metadata?.analysis);
    }
}

check();
