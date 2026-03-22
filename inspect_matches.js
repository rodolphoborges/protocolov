const { createClient } = require('@supabase/supabase-js');

const url = 'https://jneuumdktavwzdwvcuhf.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpuZXV1bWRrdGF2d3pkd3ZjdWhmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzk4MDIzMSwiZXhwIjoyMDg5NTU2MjMxfQ.hJnAuAxHM_LCXi_sELcvwOIpkUx-per0nwtZBaprSrk';
const supabase = createClient(url, key);

async function inspectMatches() {
    const { data, error } = await supabase
        .from('match_analysis_queue')
        .select('id, match_id, agente_tag, metadata')
        .eq('status', 'completed');

    if (error) {
        console.error('Error:', error);
        return;
    }

    const affected = data.filter(d => !d.metadata?.analysis?.first_bloods || !d.metadata?.analysis?.estimated_rank);
    const uniqueMatches = [...new Set(affected.map(a => a.match_id))];
    
    console.log(`Analyses needing update: ${affected.length}`);
    console.log(`Unique match IDs among affected: ${uniqueMatches.length}`);
}

inspectMatches();
