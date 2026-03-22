const { analyzeMatch } = require('./oraculo');
const { createClient } = require('@supabase/supabase-js');

const url = 'https://jneuumdktavwzdwvcuhf.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpuZXV1bWRrdGF2d3pkd3ZjdWhmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzk4MDIzMSwiZXhwIjoyMDg5NTU2MjMxfQ.hJnAuAxHM_LCXi_sELcvwOIpkUx-per0nwtZBaprSrk';
const supabase = createClient(url, key);

async function migrate() {
    console.log('--- STARTING GLOBAL MIGRATION ---');
    
    // Fetch all records needing update
    const { data: records, error } = await supabase
        .from('match_analysis_queue')
        .select('id, match_id, agente_tag, metadata')
        .eq('status', 'completed');

    if (error) {
        console.error('Error fetching records:', error);
        return;
    }

    const affected = records.filter(d => !d.metadata?.analysis?.first_bloods || !d.metadata?.analysis?.estimated_rank);
    console.log(`Found ${affected.length} records to update.`);

    for (let i = 0; i < affected.length; i++) {
        const record = affected[i];
        console.log(`[${i+1}/${affected.length}] Processing ${record.agente_tag} in ${record.match_id}...`);
        
        try {
            const result = await analyzeMatch(record.match_id, record.agente_tag);
            
            if (result.status === 'completed') {
                const updatedMeta = { 
                    ...(record.metadata || {}), 
                    analysis: result.report 
                };

                const { error: updateError } = await supabase
                    .from('match_analysis_queue')
                    .update({ 
                        metadata: updatedMeta,
                        processed_at: new Date().toISOString()
                    })
                    .eq('id', record.id);
                    
                if (updateError) {
                    console.error(`  ❌ Update error for ${record.id}:`, updateError.message);
                } else {
                    console.log(`  ✅ Updated. FK: ${result.report.first_bloods}, Rank: ${result.report.estimated_rank}`);
                }
            } else {
                console.error(`  ❌ Analysis failed for ${record.id}:`, result.error);
            }
        } catch (err) {
            console.error(`  ❌ Critical error for ${record.id}:`, err.message);
        }

        // Delay to avoid overwhelming API (2s between each match)
        if (i < affected.length - 1) {
            await new Promise(res => setTimeout(res, 2000));
        }
    }

    console.log('--- GLOBAL MIGRATION COMPLETED ---');
}

migrate();
